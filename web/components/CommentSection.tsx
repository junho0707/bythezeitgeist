"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthUser, CommentNode } from "@/lib/types";

function Comment({
  node,
  itemKey,
  user,
  onChanged,
  depth = 0,
}: {
  node: CommentNode;
  itemKey: string;
  user: AuthUser | null;
  onChanged: () => void;
  depth?: number;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function vote(value: 1 | -1) {
    if (!user) return;
    await fetch(`/api/comments/${node.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    onChanged();
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemKey, parentId: node.id, body: reply }),
    });
    setBusy(false);
    setReply("");
    setReplyOpen(false);
    onChanged();
  }

  return (
    <article className="comment" style={{ marginLeft: Math.min(depth, 4) * 16 }}>
      <div className="vote-col">
        <button
          type="button"
          className={node.myVote === 1 ? "on" : ""}
          onClick={() => vote(1)}
          disabled={!user}
          aria-label="Upvote"
        >
          ▲
        </button>
        <span>{node.score}</span>
        <button
          type="button"
          className={node.myVote === -1 ? "on" : ""}
          onClick={() => vote(-1)}
          disabled={!user}
          aria-label="Downvote"
        >
          ▼
        </button>
      </div>
      <div>
        <p className="comment-meta">
          <strong>{node.displayName}</strong>{" "}
          <time dateTime={node.createdAt}>{new Date(node.createdAt).toLocaleString()}</time>
        </p>
        <p className="comment-body">{node.body}</p>
        {user && (
          <button type="button" className="text-btn" onClick={() => setReplyOpen((v) => !v)}>
            Reply
          </button>
        )}
        {replyOpen && (
          <form className="reply-form" onSubmit={submitReply}>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={2000}
              required
            />
            <button type="submit" disabled={busy}>
              Post reply
            </button>
          </form>
        )}
        {node.replies.map((child) => (
          <Comment
            key={child.id}
            node={child}
            itemKey={itemKey}
            user={user}
            onChanged={onChanged}
            depth={depth + 1}
          />
        ))}
      </div>
    </article>
  );
}

export function CommentSection({ itemKey }: { itemKey: string }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [me, list] = await Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch(`/api/comments?itemKey=${encodeURIComponent(itemKey)}`).then((r) => r.json()),
    ]);
    setUser(me.user);
    setComments(list.comments ?? []);
  }, [itemKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemKey, body }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not post.");
      return;
    }
    setBody("");
    refresh();
  }

  return (
    <section className="comments">
      <h2 className="block-title">Feed</h2>
      {user ? (
        <form className="comment-form" onSubmit={submit}>
          <textarea
            placeholder="Write your comment"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            required
          />
          {error && <p className="form-error">{error}</p>}
          <button type="submit">Publish comment</button>
        </form>
      ) : (
        <p className="empty">Sign in to comment, upvote, and reply.</p>
      )}
      {comments.length === 0 ? (
        <p className="empty">No comments yet.</p>
      ) : (
        comments.map((node) => (
          <Comment
            key={node.id}
            node={node}
            itemKey={itemKey}
            user={user}
            onChanged={refresh}
          />
        ))
      )}
    </section>
  );
}
