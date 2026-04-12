import { getEnv } from "./env";
import { MAX_URL_LENGTH } from "./constants";

// Controls and line breaks (CRLF / header injection).
const DISALLOWED_URL_TEXT =
  /[\u0000-\u001F\u007F\u2028\u2029]/;

export function assertUrlStringSanitized(s: string): void {
  if (DISALLOWED_URL_TEXT.test(s)) {
    throw new UrlValidationError(
      "URL contains disallowed control or line-break characters",
      400,
    );
  }
}

// Re-check stored URL before redirect; strip creds from http(s) href.
export function getSafeRedirectUrl(stored: string): string | null {
  const trimmed = stored.trim();
  if (!trimmed || DISALLOWED_URL_TEXT.test(trimmed)) {
    return null;
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return null;
  }
  if (!u.hostname) {
    return null;
  }
  u.username = "";
  u.password = "";
  u.hostname = u.hostname.toLowerCase();
  if (u.protocol === "http:" && u.port === "80") u.port = "";
  if (u.protocol === "https:" && u.port === "443") u.port = "";
  const href = u.href;
  if (DISALLOWED_URL_TEXT.test(href)) {
    return null;
  }
  return href;
}

export class UrlValidationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "UrlValidationError";
  }
}

function isPrivateOrLoopbackIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function parseIpv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1, 5).map((x) => Number(x));
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0") return true;
  if (h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "[::1]") return true;

  const v4 = parseIpv4(h);
  if (v4 && isPrivateOrLoopbackIpv4(v4)) return true;

  if (h.includes(":")) {
    const compact = h.replace(/^\[|\]$/g, "");
    if (compact === "::1") return true;
    if (compact.toLowerCase().startsWith("fe80:")) return true;
    if (compact.toLowerCase().startsWith("fc") || compact.toLowerCase().startsWith("fd"))
      return true;
  }
  return false;
}

export function assertUrlAllowedForShortening(raw: string): string {
  const env = getEnv();
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new UrlValidationError("URL is required", 400);
  }
  assertUrlStringSanitized(trimmed);
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new UrlValidationError("URL is too long", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UrlValidationError("Invalid URL", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlValidationError("Only http and https URLs are allowed", 400);
  }

  if (env.BLOCK_INTERNAL_URLS && isBlockedHostname(parsed.hostname)) {
    throw new UrlValidationError(
      "URLs targeting loopback or private addresses are not allowed",
      400,
    );
  }

  const normalized = normalizeLongUrl(parsed);
  assertUrlStringSanitized(normalized);
  return normalized;
}

export function normalizeLongUrl(url: URL): string {
  const u = new URL(url.href);
  u.username = "";
  u.password = "";
  u.hostname = u.hostname.toLowerCase();
  if (u.protocol === "http:" && u.port === "80") u.port = "";
  if (u.protocol === "https:" && u.port === "443") u.port = "";
  return u.href;
}
