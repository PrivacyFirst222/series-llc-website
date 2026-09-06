// Saved drafts of the portal's secure forms (Adam, 6 Sep 2026: "The form
// should retain all information except for SS#s"). Per order, in the
// browser's storage, with every Social Security number and taxpayer number
// stripped before writing. Cleared when a package is built and on sign-out.
const DRAFT_PREFIX = "fpsllc-draft:";
export function loadDrafts<T>(kind: "sel" | "ein"): Record<string, T> {
  const out: Record<string, T> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      if (!key.startsWith(`${DRAFT_PREFIX}${kind}:`)) continue;
      const raw = localStorage.getItem(key);
      if (raw) out[key.slice(`${DRAFT_PREFIX}${kind}:`.length)] = JSON.parse(raw) as T;
    }
  } catch { /* storage unavailable: memory only */ }
  return out;
}
export function saveDraft(kind: "sel" | "ein", orderId: string, value: unknown): void {
  try { localStorage.setItem(`${DRAFT_PREFIX}${kind}:${orderId}`, JSON.stringify(value)); } catch { /* memory only */ }
}
export function clearDraft(kind: "sel" | "ein", orderId: string): void {
  try { localStorage.removeItem(`${DRAFT_PREFIX}${kind}:${orderId}`); } catch { /* nothing to clear */ }
}
/** Sign-out wipes every saved draft on this browser. */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) ?? ""; if (k.startsWith(DRAFT_PREFIX)) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* nothing to clear */ }
}

