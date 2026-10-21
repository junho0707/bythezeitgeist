"""Loads zeitgeist/.env into the environment (keys stay out of git).
Import this before anything that reads settings at import time."""

import os
from pathlib import Path


def load() -> None:
    path = Path(__file__).resolve().parent / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key and not key.startswith("#"):
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load()
