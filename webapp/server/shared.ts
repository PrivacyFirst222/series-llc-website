// Helpers shared by every route module (split from app.ts, 29 Aug 2026).
// testHooks replaces two module-level `let` flags: exported let bindings are
// read-only for importers in ESM, and the dev routes must assign them.
import { getSession } from "./auth";

export const testHooks = {
  /** Makes the next fulfillment throw once (dev suite scaffolding). */
  failNextFulfillment: false,
  /** When >= 0, the (N+1)th putFile in the next formation upload throws. */
  failFormationPutAfter: -1,
};


export const err = (message: string, code: string) => ({ error: { message, code } });


/* ---------------------------- account settings --------------------------- */

/** Masks an address for the anti-hijack notice: a•••@example.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(2, local.length - 1))}@${domain ?? ""}`;
}


export async function requireAdmin(c: Parameters<typeof getSession>[0]) {
  const session = await getSession(c);
  return session?.isAdmin ? session : null;
}


export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;


/** A client-facing PDF must actually be one: %PDF- header and a %%EOF marker
 *  in the tail. This is deliberately a structure sniff, not a full parse — the
 *  uploads come from Adam, and the failure it catches is a mis-clicked file
 *  (an HTML error page saved as .pdf, a Word doc, a truncated download)
 *  landing in a client's portal as their filed Articles (Codex UPLOAD-001). */
export const looksLikePdf = async (f: File): Promise<boolean> => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (bytes.length < 8) return false;
  const head = new TextDecoder().decode(bytes.slice(0, 8));
  if (!head.startsWith("%PDF-")) return false;
  const tail = new TextDecoder().decode(bytes.slice(-1024));
  return tail.includes("%%EOF");
};
