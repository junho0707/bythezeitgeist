import { StoryAtPage } from "@/components/StoryAtPage";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ horizon: string; date: string; slug: string }>;
}) {
  await loadData();
  const { horizon, date, slug } = await params;
  return <StoryAtPage where={{ horizon, date }} slug={slug} inModal />;
}
