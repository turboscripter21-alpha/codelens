/**
 * Small in-memory abuse guard for the API routes. Every import spends shared GitHub API
 * quota (60 requests an hour per server IP without GITHUB_TOKEN) and up to 50 MB of
 * download + CPU, so one client must not be able to burn it for everyone.
 * Per process: on serverless each instance has its own counters (good enough for a
 * college-scale deployment; use a shared store if that ever matters).
 */
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
let active = 0;

/** Client key: the platform-set forwarded address (Vercel sets x-forwarded-for), else "local". */
export function clientKey(req: Request): string {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = xf || req.headers.get("x-real-ip") || "local";
  return ip.slice(0, 64);
}

/** Sliding window: allow `max` hits per `windowMs` per key. Returns seconds to wait, or 0. */
export function hit(scope: string, key: string, max: number, windowMs: number, now = Date.now()): number {
  const k = scope + "|" + key;
  const b = buckets.get(k) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= max) {
    buckets.set(k, b);
    return Math.max(1, Math.ceil((windowMs - (now - b.hits[0])) / 1000));
  }
  b.hits.push(now);
  buckets.set(k, b);
  if (buckets.size > 5000) for (const [kk, v] of buckets) if (!v.hits.some((t) => now - t < windowMs)) buckets.delete(kk);
  return 0;
}

/** Global cap on imports running at the same time (memory / CPU). */
export function acquire(max: number): (() => void) | null {
  if (active >= max) return null;
  active++;
  let done = false;
  return () => {
    if (!done) {
      done = true;
      active--;
    }
  };
}

const num = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);
/** Defaults suit a public deployment; override with env for local testing. */
export const LIMITS = {
  importsPerWindow: num(process.env.CODELENS_IMPORTS_PER_10MIN, 8),
  importWindowMs: 10 * 60 * 1000,
  concurrentImports: num(process.env.CODELENS_CONCURRENT_IMPORTS, 3),
  filesPerMinute: num(process.env.CODELENS_FILES_PER_MIN, 120),
};

/** Test hook. */
export function _resetRateLimits() {
  buckets.clear();
  active = 0;
}
