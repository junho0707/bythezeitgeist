import type { ReactNode } from "react";
import { Masthead } from "@/components/Masthead";

/** A plain page of text: the privacy policy and the terms. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="shell">
      <Masthead />
      <main className="list-page">
        <header className="horizon-head list-head">
          <h1 className="horizon-label">{title}</h1>
        </header>
        <article className="legal">
          <p className="legal-updated">Last updated {updated}</p>
          {children}
        </article>
      </main>
    </div>
  );
}
