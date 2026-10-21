import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy · The Zeitgeist" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="September 27, 2026">
      <p>
        The Zeitgeist shows what people are searching for and reading about. You can read every page without an
        account. This page says what we keep when you do sign up, and why.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address, the name you show on comments, and your password,
          stored only as a one-way hash.
        </li>
        <li>
          <strong>Google sign-in:</strong> if you use it, Google tells us your email address and name. We don&apos;t
          get your Google password or anything else in your Google account.
        </li>
        <li>
          <strong>What you post:</strong> your comments and votes, shown publicly with your name.
        </li>
        <li>
          <strong>A sign-in cookie</strong> that keeps you signed in for 30 days. We use no advertising or tracking
          cookies.
        </li>
      </ul>
      <h2>How we use it</h2>
      <p>
        Only to run the site: to sign you in, to email you a sign-in code when you ask for one, and to show your
        comments. We don&apos;t sell your information or use it for ads, and we don&apos;t send newsletters.
      </p>
      <h2>Who else handles it</h2>
      <p>
        The site runs on Vercel, accounts and comments are stored with Turso, and sign-in codes are emailed through
        Resend. They process the data only to provide those services to us.
      </p>
      <h2>TikTok</h2>
      <p>
        Our <Link href="/tiktok">Post to TikTok</Link> page lets the owner of a TikTok account post our news videos to it.
        When you connect TikTok, TikTok tells us your account&apos;s display name, username and profile photo, and
        lets us post the videos you choose with the settings you pick. The TikTok access token is kept only in an
        encrypted cookie in your browser for up to a day; we don&apos;t store it or anything else from your TikTok
        account on our servers. Disconnect on that page, or remove the app in TikTok&apos;s settings, at any time.
      </p>
      <h2>Deleting your account</h2>
      <p>
        Email <a href="mailto:contact@bythezeitgeist.com">contact@bythezeitgeist.com</a> from the address you signed
        up with and we&apos;ll delete your account and comments.
      </p>
      <h2>Changes</h2>
      <p>If this policy changes, the date above changes with it.</p>
    </LegalPage>
  );
}
