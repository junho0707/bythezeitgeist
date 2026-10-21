import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { voteComment } from "@/lib/comments";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { value?: number } | null;
  const value = body?.value;
  if (value !== 1 && value !== -1 && value !== 0) {
    return NextResponse.json({ error: "value must be 1, -1, or 0." }, { status: 400 });
  }
  try {
    const result = await voteComment(user.id, id, value);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Vote failed." },
      { status: 400 },
    );
  }
}
