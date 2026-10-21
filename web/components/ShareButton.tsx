"use client";

import { useState } from "react";

/** Copies the page's address (the story, under the list it came from). */
export function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard API (e.g. plain http off localhost): the old way.
      const field = document.createElement("textarea");
      field.value = url;
      document.body.append(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="action" onClick={copy}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
