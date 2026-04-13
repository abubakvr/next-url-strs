"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DEMO_ADMIN_PASSWORD } from "@/lib/constants";

const TOKEN_KEY = "url-shortener-admin-token";

type LinkItem = {
  code: string;
  longUrl: string;
  clickCount: number;
  createdAt: string;
};

type ClickItem = {
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
  code: string;
  longUrl: string;
};

type AdminJsonOk<T> = { ok: true; data: T };
type AdminJsonErr = { ok: false; status: number };

function formatAdminDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

// Helper to mask IPv4 or IPv6 addresses, e.g. "123.456.78.90" → "123.456.***.***"
function maskIp(ip: string | null): string {
  if (!ip) return "—";
  // IPv4 mask: keep first 2 octets
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
  }
  // IPv6 mask: keep first 2 hextets, mask rest
  if (/^[\da-fA-F:]+$/.test(ip) && ip.includes(":")) {
    const parts = ip.split(":");
    const shown = parts.slice(0, 2).join(":");
    return `${shown}:****:****:****`;
  }
  // If some corner-case, just partially mask
  return ip.length > 6 ? `${ip.slice(0, 4)}***` : "***";
}

async function adminJson<T>(
  path: string,
  token: string,
): Promise<AdminJsonOk<T> | AdminJsonErr> {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const data = (await res.json()) as T;
  return { ok: true, data };
}

export function AdminDashboard() {
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [clicks, setClicks] = useState<ClickItem[]>([]);
  const [summary, setSummary] = useState<{
    linkCount: number;
    clickCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) setToken(stored);
  }, []);

  const loadData = useCallback(async (t: string) => {
    setError(null);
    setLoading(true);
    try {
      const [linksR, clicksR, sumR] = await Promise.all([
        adminJson<{ items: LinkItem[] }>("/api/admin/links?limit=200", t),
        adminJson<{ items: ClickItem[] }>("/api/admin/clicks?limit=100", t),
        adminJson<{ linkCount: number; clickCount: number }>(
          "/api/admin/summary",
          t,
        ),
      ]);
      if (
        (!linksR.ok && linksR.status === 401) ||
        (!clicksR.ok && clicksR.status === 401) ||
        (!sumR.ok && sumR.status === 401)
      ) {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setError("Invalid or expired admin token.");
        return;
      }
      if (!linksR.ok || !clicksR.ok || !sumR.ok) {
        setError("Failed to load admin data.");
        return;
      }
      setLinks(linksR.data.items);
      setClicks(clicksR.data.items);
      setSummary(sumR.data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void loadData(token);
  }, [token, loadData]);

  function saveToken(e: React.FormEvent) {
    e.preventDefault();
    const t = tokenInput.trim();
    if (!t) return;
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setTokenInput("");
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setLinks([]);
    setClicks([]);
    setSummary(null);
  }

  if (!token) {
    return (
      <div className="w-full max-w-md space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="font-medium">Testing:</span> use password{" "}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/80">
            {DEMO_ADMIN_PASSWORD}
          </code>{" "}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Enter that value below
        </p>
        <form onSubmit={saveToken} className="space-y-3">
          <input
            type="password"
            autoComplete="off"
            placeholder="Admin token"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Continue
          </button>
        </form>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <p className="text-center text-sm">
          <Link
            href="/"
            className="text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
          >
            ← Back
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Overview
          </h2>
          {summary ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {summary.linkCount} links · {summary.clickCount} recorded clicks
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadData(token)}
            disabled={loading}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Sign out
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          All URLs
        </h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-medium uppercase text-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Long URL</th>
                <th className="px-3 py-2">Clicks</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {links.map((row) => (
                <tr key={row.code} className="text-zinc-800 dark:text-zinc-100">
                  <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                  <td
                    className="max-w-xs truncate px-3 py-2"
                    title={row.longUrl}
                  >
                    {row.longUrl}
                  </td>
                  <td className="px-3 py-2">{row.clickCount}</td>
                  <td
                    className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500"
                    title={row.createdAt}
                  >
                    {formatAdminDateTime(row.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Recent clicks
        </h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-medium uppercase text-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">User-Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {clicks.map((row, i) => (
                <tr
                  key={`${row.createdAt}-${i}`}
                  className="text-zinc-800 dark:text-zinc-100"
                >
                  <td
                    className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500"
                    title={row.createdAt}
                  >
                    {formatAdminDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {maskIp(row.ip)}
                  </td>
                  <td
                    className="max-w-md truncate px-3 py-2 text-xs"
                    title={row.userAgent ?? ""}
                  >
                    {row.userAgent ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-center text-sm text-zinc-500">
        <Link href="/" className="underline-offset-2 hover:underline">
          Home
        </Link>
      </p>
    </div>
  );
}
