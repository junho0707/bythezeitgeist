import { StoryAtPage } from "@/components/StoryAtPage";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ date: string; slug: string }> }) {
  await loadData();
  const { date, slug } = await params;
  return <StoryAtPage where={{ day: date }} slug={slug} />;
}
