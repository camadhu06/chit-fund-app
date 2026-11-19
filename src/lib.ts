import { useCallback, useEffect, useState } from 'react';

export async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!data.error && res.status >= 500) throw new ApiDownError();
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Thrown when the dev proxy cannot reach the API (e.g. it is still starting). */
class ApiDownError extends Error {
  constructor() { super('Cannot reach the API server. Is `npm run dev` running?'); }
}

/** Tiny data-fetching hook: { data, error, loading, reload } */
export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          setData(await api<T>(url));
          break;
        } catch (e) {
          // the API may still be booting the database: retry for ~15 s
          if (!(e instanceof ApiDownError) || attempt >= 10) throw e;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
export const money = (v: unknown) => inr.format(Number(v ?? 0));
export const moneyExact = (v: unknown) => inrExact.format(Number(v ?? 0));
export const fmtDate = (v: unknown) =>
  v ? new Date(String(v).length === 10 ? `${v}T00:00:00` : String(v))
        .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const today = () => new Date().toLocaleDateString('en-CA');
