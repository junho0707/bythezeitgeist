import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms · The Zeitgeist" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="September 26, 2026">
      <p>By using The Zeitgeist you agree to these terms.</p>
      <h2>What the site is</h2>
      <p>
        A running list of what people search for and read about, drawn from public sources such as Google Trends and
        Wikipedia page views, with short summaries written by software. Summaries can be wrong; follow the links to
        the sources for the full story.
      </p>
      <h2>Your account and comments</h2>
      <ul>
        <li>Keep your password to yourself. You&apos;re responsible for what&apos;s posted from your account.</li>
        <li>
          You own what you post, and you let us show it on the site. Don&apos;t post anything illegal, hateful,
          harassing, or spam, or anything that isn&apos;t yours to share.
        </li>
        <li>We may remove comments or close accounts that break these rules.</li>
      </ul>
      <h2>No guarantees</h2>
      <p>
        The site is provided as is. We try to keep it accurate and running but can&apos;t promise either, and
        we&apos;re not liable for decisions made from what it shows.
      </p>
      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:contact@bythezeitgeist.com">contact@bythezeitgeist.com</a>. See also the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
