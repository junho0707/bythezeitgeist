"""
One text (or text + images) request to a language model, for summarize.py and
the video scripts (write.py, images.py).

LLM_PROVIDER picks the backend (env or zeitgeist/.env):
  opencode (default)  `opencode run` with the local OpenCode login; LLM_MODEL,
                      default opencode-go/kimi-k2.7-code (the OpenCode Go plan)
  openai              OpenAI's Responses API with OPENAI_API_KEY and the
                      caller's own model name

OpenCode runs as an agent, so it gets a config that denies every tool and an
empty working directory: it can only answer.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import requests

import env  # noqa: F401  (loads zeitgeist/.env)

PROVIDER = os.environ.get("LLM_PROVIDER", "opencode")
OPENCODE_MODEL = os.environ.get("LLM_MODEL", "opencode-go/kimi-k2.7-code")
OPENCODE_CONFIG = {
    "$schema": "https://opencode.ai/config.json",
    "permission": {"*": "deny"},
    "agent": {"plain": {
        "mode": "primary",
        "prompt": "Follow the user's instructions exactly. Reply with the requested text only.",
        "tools": {"*": False},
    }},
}


class LLMError(RuntimeError):
    pass


# OpenAI tokens used by this process, for the per-run cost line in the log.
usage = {"requests": 0, "input": 0, "output": 0, "reasoning": 0}


def available() -> bool:
    if os.environ.get("ZG_SUMMARIES") == "0":  # the laptop's pull: the hourly Action writes them
        return False
    if PROVIDER == "openai":
        return bool(os.environ.get("OPENAI_API_KEY"))
    return bool(opencode_bin())


def model_name(openai_model: str) -> str:
    return openai_model if PROVIDER == "openai" else OPENCODE_MODEL


def respond(instructions: str, text: str, *, model: str, images: list[str] = (), json_mode: bool = False,
            reasoning: str | None = None, timeout: int = 300) -> str:
    """The model's reply to `text` under `instructions`. `images` are URLs;
    `model` and `reasoning` (OpenAI's effort, e.g. "minimal") apply to OpenAI
    only; OpenCode uses LLM_MODEL."""
    if PROVIDER == "openai":
        return _openai(instructions, text, model, images, json_mode, reasoning, timeout)
    return _opencode(instructions, text, images, timeout)


def opencode_bin() -> str | None:
    return shutil.which("opencode") or next(
        (str(p) for p in [Path.home() / ".opencode/bin/opencode"] if p.exists()), None)


def _openai(instructions, text, model, images, json_mode, reasoning, timeout) -> str:
    content = [{"type": "input_text", "text": text}]
    content += [{"type": "input_image", "image_url": u, "detail": "low"} for u in images]
    body = {"model": model, "instructions": instructions, "input": [{"role": "user", "content": content}]}
    if json_mode:
        body["text"] = {"format": {"type": "json_object"}}
    if reasoning:
        body["reasoning"] = {"effort": reasoning}
    resp = requests.post("https://api.openai.com/v1/responses", timeout=timeout, json=body,
                         headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"})
    if resp.status_code != 200:
        raise LLMError(f"OpenAI HTTP {resp.status_code}: {resp.text[:400]}")
    u = resp.json().get("usage") or {}
    usage["requests"] += 1
    usage["input"] += u.get("input_tokens") or 0
    usage["output"] += u.get("output_tokens") or 0
    usage["reasoning"] += (u.get("output_tokens_details") or {}).get("reasoning_tokens") or 0
    return "".join(piece.get("text") or "" for block in resp.json().get("output") or []
                   if block.get("type") == "message" for piece in block.get("content") or []
                   if piece.get("type") == "output_text")


def _opencode(instructions, text, images, timeout) -> str:
    exe = opencode_bin()
    if not exe:
        raise LLMError("opencode is not installed")
    with tempfile.TemporaryDirectory(prefix="zg-llm-") as tmp:
        work = Path(tmp) / "work"
        work.mkdir()
        config = Path(tmp) / "opencode.json"
        config.write_text(json.dumps(OPENCODE_CONFIG))
        files = []
        for i, url in enumerate(images):
            # All or none: a missing one would shift the rest out of their order.
            r = requests.get(url, timeout=60, headers={"User-Agent": "bythezeitgeist.com"})
            if not r.ok:
                raise LLMError(f"image {i} download failed ({r.status_code})")
            files.append(Path(tmp) / f"image{i}.jpg")
            files[-1].write_bytes(r.content)
        # The message must come before -f, which takes every argument after it.
        cmd = [exe, "run", f"{instructions}\n\n---\n\n{text}", "--pure", "--agent", "plain",
               "--format", "json", "-m", OPENCODE_MODEL]
        if files:
            cmd += ["-f", *map(str, files)]
        try:
            p = subprocess.run(cmd, cwd=work, capture_output=True, text=True, timeout=timeout,
                               env={**os.environ, "OPENCODE_CONFIG": str(config)})
        except subprocess.TimeoutExpired:
            raise LLMError(f"opencode timed out after {timeout}s") from None
    parts, errors = [], []
    for line in p.stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") == "text":
            parts.append(event.get("part", {}).get("text") or "")
        elif event.get("type") == "error":
            errors.append(json.dumps(event.get("error"))[:300])
    if not parts:
        raise LLMError(f"opencode: {'; '.join(errors) or p.stderr.strip()[-400:] or 'no reply'}")
    return "".join(parts)
