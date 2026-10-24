import Link from "next/link";

/** CodeLens wordmark with a tiny three-tower mark. */
export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-ink no-underline" aria-label="CodeLens home">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="1" y="11" width="5" height="10" rx="1" fill="#7fc8c0" />
        <rect x="8" y="3" width="6" height="18" rx="1" fill="#12161c" />
        <rect x="16" y="8" width="5" height="13" rx="1" fill="#ffc21a" />
      </svg>
      <span className="text-[1.15rem] font-[760] tracking-[-0.03em]">CodeLens</span>
    </Link>
  );
}
