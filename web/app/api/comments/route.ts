import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createComment, listComments } from "@/lib/comments";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const itemKey = req.nextUrl.searchParams.get("itemKey") ?? "";
  if (!itemKey) return NextResponse.json({ error: "itemKey required" }, { status: 400 });
  const user = await getCurrentUser();
  return NextResponse.json({ comments: await listComments(itemKey, user?.id) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to comment." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    itemKey?: string;
    parentId?: string | null;
    body?: string;
  } | null;
  if (!body?.itemKey || !body.body) {
    return NextResponse.json({ error: "itemKey and body required." }, { status: 400 });
  }
  try {
    const comment = await createComment({
      itemKey: body.itemKey,
      userId: user.id,
      parentId: body.parentId ?? null,
      body: body.body,
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not post comment." },
      { status: 400 },
    );
  }
}
