"use client";

import { useState } from "react";
import Link from "next/link";

type ShortenResponse = {
  code: string;
  shortUrl: string;
  longUrl: string;
  clickCount: number;
  createdAt: string;
  isDuplicate: boolean;
};

function errorMessageForResponse(
  res: Response,
  body: { error?: string },
): string {
  const server = body.error?.trim();
  switch (res.status) {
    case 400:
      return (
        server ||
        "Check the URL: it must start with http:// or https:// and use only allowed characters."
      );
    case 413:
      return server || "That URL or request is too large. Try a shorter link.";
    case 429:
      return "Too many requests from your network. Please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
      return server || "The server had a problem. Please try again in a moment.";
    default:
      return server || `Request failed (${res.status}).`;
  }
}

export function ShortenForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShortenResponse | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setCopied(false);

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a URL.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      let data: { error?: string } & Partial<ShortenResponse> = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        if (!res.ok) {
          setError(errorMessageForResponse(res, {}));
          return;
        }
      }
      if (!res.ok) {
        setError(errorMessageForResponse(res, data));
        return;
      }
      if (
        typeof data.code !== "string" ||
        typeof data.shortUrl !== "string" ||
        typeof data.longUrl !== "string" ||
        typeof data.isDuplicate !== "boolean"
      ) {
        setError("Unexpected response from the server. Please try again.");
        return;
      }
      setResult(data as ShortenResponse);
      setUrl("");
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyShort() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div className="w-full max-w-xl space-y-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="url"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Link to shorten
          </label>
          <input
            id="url"
            name="url"
            type="text"
            inputMode="url"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm outline-none ring-zinc-400 placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "url-error" : undefined}
          />
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            Use <span className="font-medium">http://</span> or{" "}
            <span className="font-medium">https://</span>. If you shorten the same URL
            again, you get the same short link.
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {loading ? "Creating link…" : "Create short link"}
        </button>
      </form>

      {error ? (
        <p
          id="url-error"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div
          className={`space-y-4 rounded-xl border p-4 ${
            result.isDuplicate
              ? "border-amber-200 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/30"
              : "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/25"
          }`}
          role="status"
        >
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {result.isDuplicate
              ? "You already shortened this URL"
              : "Your short link is ready"}
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {result.isDuplicate
              ? "Here is the same short link we already had for this address."
              : "Copy it below and share it anywhere you like."}
          </p>

          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Original link
            </span>
            <p className="break-all rounded-md bg-white/80 px-2 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200/80 dark:bg-zinc-950/80 dark:text-zinc-100 dark:ring-zinc-800">
              {result.longUrl}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Short URL
            </span>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 break-all rounded-md bg-white px-2 py-2 text-sm font-medium text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-50 dark:ring-zinc-800">
                {result.shortUrl}
              </code>
              <button
                type="button"
                onClick={copyShort}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200/80 pt-3 text-xs text-zinc-600 dark:border-zinc-700/80 dark:text-zinc-400">
            <a
              href={`/s/${result.code}`}
              className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
            >
              Open short link (/s/{result.code})
            </a>
            <span aria-label="Click count">Total clicks: {result.clickCount}</span>
          </div>
        </div>
      ) : null}

      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        <Link
          href="/admin"
          className="font-medium text-zinc-800 underline-offset-2 hover:underline dark:text-zinc-200"
        >
          Admin dashboard
        </Link>
      </p>
    </div>
  );
}
