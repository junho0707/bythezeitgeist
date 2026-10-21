import { notFound } from "next/navigation";
import { DayView } from "@/components/DayView";
import { Masthead } from "@/components/Masthead";
import { loadDay } from "@/lib/days";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** One saved day: everything that was popping, in the Today format. */
export default async function DayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await loadData();
  const { date } = await params;
  const day = loadDay(date);
  if (!day) notFound();
  const query = await searchParams;

  return (
    <div className="shell">
      <Masthead active="calendar" />
      <DayView day={day} query={query} />
    </div>
  );
}
