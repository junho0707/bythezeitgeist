import Link from "next/link";
import type { Metadata } from "next";
import { Fraunces, Inter, Newsreader } from "next/font/google";
import "./globals.css";

const editorial = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-editorial-face",
});

// Wordmark only: a high-contrast serif with more personality than the
// body face, so the masthead doesn't read as a borrowed newspaper.
const brand = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  variable: "--font-brand-face",
});

const ui = Inter({
  subsets: ["latin"],
  variable: "--font-ui-face",
});

export const metadata: Metadata = {
  title: "By the Zeitgeist",
  description: "A newspaper of what people are actually paying attention to — with numbers.",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  /** A story or day opened over the current page (app/@modal). */
  modal: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${editorial.variable} ${brand.variable} ${ui.variable}`}>
      <body>
        {children}
        <footer className="site-foot">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </footer>
        {modal}
      </body>
    </html>
  );
}
