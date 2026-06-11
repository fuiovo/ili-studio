// Client-side API helpers + key storage.

import { ApiKeys, Project } from "./types";

export async function api<T = { project: Project }>(
  url: string,
  body?: unknown,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    method: body !== undefined ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data as T;
}

const KEYS_STORAGE = "ili-studio-keys";

export function loadKeys(): { keys: ApiKeys; remembered: boolean } {
  if (typeof window === "undefined") return { keys: {}, remembered: false };
  try {
    const raw = localStorage.getItem(KEYS_STORAGE);
    if (raw) return { keys: JSON.parse(raw), remembered: true };
  } catch {
    /* ignore */
  }
  return { keys: {}, remembered: false };
}

export function persistKeys(keys: ApiKeys, remember: boolean): void {
  if (typeof window === "undefined") return;
  if (remember) {
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
  } else {
    localStorage.removeItem(KEYS_STORAGE);
  }
}
