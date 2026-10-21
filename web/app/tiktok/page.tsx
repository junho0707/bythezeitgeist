import type { Metadata } from "next";
import { Masthead } from "@/components/Masthead";
import { TikTokPoster } from "@/components/TikTokPoster";
import { getTikTokSession, stagedVideos } from "@/lib/tiktok";

export const metadata: Metadata = { title: "Post to TikTok · The Zeitgeist", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TikTokPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [session, videos, { error }] = await Promise.all([getTikTokSession(), stagedVideos(), searchParams]);
  return (
    <div className="shell">
      <Masthead />
      <main className="list-page">
        <header className="horizon-head list-head">
          <h1 className="horizon-label">Post to TikTok</h1>
        </header>
        <TikTokPoster connected={!!session} videos={videos} error={error} />
      </main>
    </div>
  );
}
