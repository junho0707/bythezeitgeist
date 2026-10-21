"use client";

import { useEffect, useState } from "react";
import type { StagedVideo } from "@/lib/tiktok";

type Creator = {
  creator_avatar_url: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
};

const PRIVACY: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};
const MUSIC = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRANDED = "https://www.tiktok.com/legal/page/global/bc-policy/en";

/** Connect a TikTok account, then post one of our staged videos to it. */
export function TikTokPoster({ connected, videos, error }: { connected: boolean; videos: StagedVideo[]; error?: string }) {
  const [creator, setCreator] = useState<Creator | null>(null);
  const [creatorError, setCreatorError] = useState(error ?? "");
  const [id, setId] = useState(videos[0]?.id ?? "");
  const video = videos.find((v) => v.id === id);
  const [caption, setCaption] = useState(video?.caption ?? "");
  const [privacy, setPrivacy] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [disclose, setDisclose] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!connected) return;
    fetch("/api/tiktok/creator")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setCreator(j);
      })
      .catch((e) => setCreatorError(e.message));
  }, [connected]);

  useEffect(() => {
    setCaption(video?.caption ?? "");
    setStatus("");
  }, [video]);

  // Branded content can't be private.
  useEffect(() => {
    if (brandedContent && privacy === "SELF_ONLY") setPrivacy("");
  }, [brandedContent, privacy]);

  const tooLong = !!(creator && video && video.duration > creator.max_video_post_duration_sec);
  const discloseIncomplete = disclose && !yourBrand && !brandedContent;
  const canPost = !!(creator && video && privacy && !tooLong && !discloseIncomplete && !busy);

  async function post() {
    if (!video) return;
    setBusy(true);
    setStatus("Uploading to TikTok…");
    try {
      const r = await fetch("/api/tiktok/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: video.id,
          caption,
          privacyLevel: privacy,
          allowComment,
          allowDuet,
          allowStitch,
          yourBrand: disclose && yourBrand,
          brandedContent: disclose && brandedContent,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setStatus("Sent. TikTok is processing it; it can take a few minutes to appear on your profile.");
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 5000));
        const s = await fetch("/api/tiktok/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ publishId: j.publishId }),
        }).then((x) => x.json());
        if (s.status === "PUBLISH_COMPLETE") return setStatus("Posted. It's on your TikTok profile.");
        if (s.status === "FAILED") throw new Error(`TikTok couldn't post it (${s.fail_reason ?? "unknown reason"}).`);
        if (s.error) throw new Error(s.error);
      }
      setStatus("Still processing. Check your TikTok profile in a few minutes.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await fetch("/api/tiktok/logout", { method: "POST" });
    location.href = "/tiktok";
  }

  if (!connected) {
    return (
      <div className="tt">
        {creatorError ? <p className="tt-error">{creatorError}</p> : null}
        <p className="tt-lead">Connect the TikTok account these videos should be posted to.</p>
        <button type="button" className="tt-button" onClick={() => (location.href = "/api/tiktok/login")}>
          Continue with TikTok
        </button>
      </div>
    );
  }

  return (
    <div className="tt">
      <div className="tt-account">
        {creator ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={creator.creator_avatar_url} alt="" width={48} height={48} />
            <div>
              <div className="tt-name">{creator.creator_nickname}</div>
              <div className="tt-meta">@{creator.creator_username}</div>
            </div>
          </>
        ) : (
          <div className="tt-meta">{creatorError || "Loading your TikTok account…"}</div>
        )}
        <button type="button" className="tt-link" onClick={disconnect}>
          Disconnect
        </button>
      </div>

      {!videos.length ? (
        <p className="tt-lead">No videos are ready to post.</p>
      ) : (
        <div className="tt-grid">
          <div className="tt-preview">
            {video ? <video key={video.id} src={video.video} poster={video.cover ?? undefined} controls playsInline /> : null}
          </div>

          <div className="tt-form">
            <label className="tt-field">
              <span>Video</span>
              <select value={id} onChange={(e) => setId(e.target.value)}>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="tt-field">
              <span>Caption</span>
              <textarea value={caption} maxLength={2200} rows={6} onChange={(e) => setCaption(e.target.value)} />
            </label>

            <label className="tt-field">
              <span>Who can view this video</span>
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                <option value="" disabled>
                  Choose…
                </option>
                {(creator?.privacy_level_options ?? []).map((p) => (
                  <option key={p} value={p} disabled={p === "SELF_ONLY" && disclose && brandedContent}>
                    {PRIVACY[p] ?? p}
                    {p === "SELF_ONLY" && disclose && brandedContent ? " (not available for branded content)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="tt-field">
              <span>Allow users to</span>
              <div className="tt-checks">
                <label className={creator?.comment_disabled ? "is-off" : ""}>
                  <input type="checkbox" checked={allowComment} disabled={!creator || creator.comment_disabled} onChange={(e) => setAllowComment(e.target.checked)} />
                  Comment
                </label>
                <label className={creator?.duet_disabled ? "is-off" : ""}>
                  <input type="checkbox" checked={allowDuet} disabled={!creator || creator.duet_disabled} onChange={(e) => setAllowDuet(e.target.checked)} />
                  Duet
                </label>
                <label className={creator?.stitch_disabled ? "is-off" : ""}>
                  <input type="checkbox" checked={allowStitch} disabled={!creator || creator.stitch_disabled} onChange={(e) => setAllowStitch(e.target.checked)} />
                  Stitch
                </label>
              </div>
            </fieldset>

            <fieldset className="tt-field">
              <label className="tt-toggle">
                <input type="checkbox" checked={disclose} onChange={(e) => setDisclose(e.target.checked)} />
                Disclose video content
              </label>
              <p className="tt-meta">Turn this on if the video promotes yourself, a third party, or both.</p>
              {disclose ? (
                <div className="tt-checks tt-stack">
                  <label>
                    <input type="checkbox" checked={yourBrand} onChange={(e) => setYourBrand(e.target.checked)} />
                    Your brand <span className="tt-meta">— you are promoting yourself or your own business</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={brandedContent} onChange={(e) => setBrandedContent(e.target.checked)} />
                    Branded content <span className="tt-meta">— you are promoting another brand or a third party</span>
                  </label>
                  {discloseIncomplete ? <p className="tt-meta">Choose at least one to post.</p> : null}
                  {brandedContent ? (
                    <p className="tt-note">Your video will be labeled as &ldquo;Paid partnership&rdquo;.</p>
                  ) : yourBrand ? (
                    <p className="tt-note">Your video will be labeled as &ldquo;Promotional content&rdquo;.</p>
                  ) : null}
                </div>
              ) : null}
            </fieldset>

            {tooLong ? <p className="tt-error">This video is longer than your account can post ({creator?.max_video_post_duration_sec}s).</p> : null}

            <p className="tt-consent">
              By posting, you agree to TikTok&apos;s{" "}
              {disclose && brandedContent ? (
                <>
                  <a href={BRANDED} target="_blank" rel="noreferrer">
                    Branded Content Policy
                  </a>{" "}
                  and{" "}
                </>
              ) : null}
              <a href={MUSIC} target="_blank" rel="noreferrer">
                Music Usage Confirmation
              </a>
              .
            </p>

            <button type="button" className="tt-button" disabled={!canPost} onClick={post}>
              {busy ? "Posting…" : "Post to TikTok"}
            </button>
            {status ? <p className="tt-status">{status}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
