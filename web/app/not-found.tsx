import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell">
      <header className="page-head">
        <p className="story-label">404</p>
        <h1 className="hl hl-lead">Not in this edition</h1>
        <p className="dek dek-lead">
          <Link href="/" className="text-link">
            Return to the front page
          </Link>
        </p>
      </header>
    </div>
  );
}
