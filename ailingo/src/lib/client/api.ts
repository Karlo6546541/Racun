"use client";
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export async function api<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: (data as { error?: string }).error ?? "INTERNAL" };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "OFFLINE" };
  }
}
