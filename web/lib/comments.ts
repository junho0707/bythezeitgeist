import { all, getDb, one, run } from "./db";
import type { CommentNode } from "./types";

type CommentRow = {
  id: string;
  item_key: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  score: number;
  created_at: string;
  display_name: string;
};

export async function listComments(itemKey: string, userId?: string | null): Promise<CommentNode[]> {
  const rows = await all<CommentRow>(
    `SELECT c.*, u.display_name
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.item_key = ?
     ORDER BY c.created_at ASC`,
    [itemKey],
  );

  const votes = new Map<string, 1 | -1>();
  if (userId) {
    const mine = await all<{ comment_id: string; value: number }>(
      `SELECT v.comment_id, v.value FROM votes v
       JOIN comments c ON c.id = v.comment_id
       WHERE c.item_key = ? AND v.user_id = ?`,
      [itemKey, userId],
    );
    for (const v of mine) votes.set(v.comment_id, v.value === -1 ? -1 : 1);
  }

  const nodes = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      itemKey: row.item_key,
      userId: row.user_id,
      displayName: row.display_name,
      parentId: row.parent_id,
      body: row.body,
      score: row.score,
      myVote: votes.get(row.id) ?? 0,
      createdAt: row.created_at,
      replies: [],
    });
  }
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortTree = (list: CommentNode[]) => {
    list.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
    list.forEach((n) => sortTree(n.replies));
  };
  sortTree(roots);
  return roots;
}

export async function createComment(input: {
  itemKey: string;
  userId: string;
  parentId?: string | null;
  body: string;
}): Promise<CommentNode> {
  const body = input.body.trim();
  if (body.length < 1 || body.length > 2000) {
    throw new Error("Comment must be 1–2000 characters.");
  }
  if (input.parentId) {
    const parent = await one<{ id: string; item_key: string }>(
      "SELECT id, item_key FROM comments WHERE id = ?",
      [input.parentId],
    );
    if (!parent || parent.item_key !== input.itemKey) {
      throw new Error("Parent comment not found.");
    }
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await run(
    `INSERT INTO comments (id, item_key, user_id, parent_id, body, score, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [id, input.itemKey, input.userId, input.parentId ?? null, body, createdAt],
  );

  const user = (await one<{ display_name: string }>("SELECT display_name FROM users WHERE id = ?", [
    input.userId,
  ]))!;
  return {
    id,
    itemKey: input.itemKey,
    userId: input.userId,
    displayName: user.display_name,
    parentId: input.parentId ?? null,
    body,
    score: 0,
    myVote: 0,
    createdAt,
    replies: [],
  };
}

export async function voteComment(userId: string, commentId: string, value: 1 | -1 | 0) {
  const comment = await one<{ id: string }>("SELECT id FROM comments WHERE id = ?", [commentId]);
  if (!comment) throw new Error("Comment not found.");

  const tx = await (await getDb()).transaction("write");
  try {
    const existing = (
      await tx.execute({ sql: "SELECT value FROM votes WHERE user_id = ? AND comment_id = ?", args: [userId, commentId] })
    ).rows[0] as unknown as { value: number } | undefined;
    // The same vote again takes it back.
    const next = existing && existing.value === value ? 0 : value;
    if (existing) {
      await tx.execute({ sql: "DELETE FROM votes WHERE user_id = ? AND comment_id = ?", args: [userId, commentId] });
    }
    if (next !== 0) {
      await tx.execute({
        sql: "INSERT INTO votes (user_id, comment_id, value) VALUES (?, ?, ?)",
        args: [userId, commentId, next],
      });
    }
    const row = (
      await tx.execute({ sql: "SELECT COALESCE(SUM(value), 0) AS score FROM votes WHERE comment_id = ?", args: [commentId] })
    ).rows[0] as unknown as { score: number };
    const score = Number(row.score);
    await tx.execute({ sql: "UPDATE comments SET score = ? WHERE id = ?", args: [score, commentId] });
    await tx.commit();
    return { score, myVote: next };
  } finally {
    tx.close();
  }
}
