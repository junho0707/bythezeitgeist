import { notFound } from "next/navigation";
import { DayView } from "@/components/DayView";
import { Modal } from "@/components/Modal";
import { formatDay, loadDay } from "@/lib/days";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** A day clicked on the calendar opens over it; /day/[date] is the full page. */
export default async function DayModal({
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
    <Modal label={formatDay(date, { weekday: "long", month: "long", day: "numeric" })}>
      <DayView day={day} query={query} />
    </Modal>
  );
}
