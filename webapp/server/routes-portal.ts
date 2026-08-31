// Split from app.ts on 29 Aug 2026 — one domain per file, code moved
// verbatim (the two dev test flags became shared.testHooks so they stay
// mutable across modules). Routes register inside registerPortalRoutes(app),
// which app.ts calls after creating the app — no circular imports.
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "./db";
import { env } from "./env";

import { CERT_STATUS_FEE_CENTS, CERTIFIED_COPY_FEE_CENTS, EIN_FEE_CENTS, S_ELECTION_FEE_CENTS, S_ELECTION_WINDOW_DAYS, SERIES_ADDON_PREP_CENTS, SERIES_ADDON_STATE_CENTS } from "./pricing";
import { buildSElectionPackage } from "./s-election";
import { sharesAreComplete, shareLabel, shareValue, type OwnershipMode, type OwnershipShare } from "../src/lib/ownership";
import { createCheckout } from "./square";
import { hashPassword, verifyPassword, newToken, hashToken, encryptSecret, decryptSecret } from "./crypto";
import { hasProtectedSeriesPhrase } from "../src/components/forms/florida-llc/validation";
import { assembleNewSeries } from "./new-series";
import { stampEastern, stampForFilename } from "./datetime";
import { assembleOa, oaVersion, OA_TEMPLATE_VERSION, type OaInputs } from "./oa";
import { renderMarkdownPdf, stampExistingPdf } from "./pdf-render";
import { createSession, getSession, destroySession, rateLimit, clientIp } from "./auth";

import { deleteFile, putFile, readFileStream } from "./storage";
import { sendMail, resetEmail, raCancellationEmail, raCancellationAdminEmail, einDetailsSubmittedAdminEmail, passwordChangedEmail, verifyNewEmail, emailChangeRequestedEmail, emailChangedEmail, sElectionReadyEmail } from "./email";
import { seriesNames } from "./filing";
import { err, maskEmail } from "./shared";

/* --------------------------------- auth -------------------------------- */

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

/* ------------------------- operating agreement ------------------------- */

export interface SeedPayload {
  filingPath?: string;
  formationType?: string;
  llcName?: { finalName?: string; desiredName?: string };
  principalOfficeAddress?: { address1?: string; address2?: string; city?: string; state?: string; zip?: string };
  management?: {
    structure?: string;
    managersOrAuthorizedRepresentatives?: { role?: string; firstName?: string; lastName?: string; suffix?: string; fullName?: string; businessEntityName?: string }[];
  };
  members?: { memberList?: { firstName?: string; lastName?: string; suffix?: string; fullLegalName?: string; address1?: string; address2?: string; city?: string; state?: string; zip?: string }[] };
  series?: { id: string; name: string }[];
}

export async function oaSeed(clientId: string, orderId?: string | null): Promise<{
  orderId: string;
  llcName: string;
  filingPath: string;
  /** "PLLC" when the company was formed professional under ch. 621. */
  formationType: string;
  managementStructure: string;
  managerNames: string[];
  principalAddress: string;
  members: { name: string; address: string }[];
  series: { name: string; purpose: string }[];
} | null> {
  const db = await getDb();
  const orders = orderId
    ? await db.query<{ id: string; payload: unknown; llc_name: string }>(
        "SELECT id, payload, llc_name FROM orders WHERE client_id = $1 AND id = $2 AND paid_at IS NOT NULL",
        [clientId, orderId],
      )
    : await db.query<{ id: string; payload: unknown; llc_name: string }>(
        // paid_at, not status = 'paid'. "Paid" stopped being the last status on
        // 16 August when filed and formed were added, and every query that asked
        // for the string rather than the fact broke silently — this one by telling
        // a client whose LLC had just been formed that they had no formed LLC.
        "SELECT id, payload, llc_name FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at DESC NULLS LAST LIMIT 1",
        [clientId],
      );
  if (orders.length === 0) return null;
  const p = (typeof orders[0].payload === "string" ? JSON.parse(orders[0].payload) : orders[0].payload) as SeedPayload;
  const addr = p.principalOfficeAddress ?? {};
  const principalAddress = [addr.address1, addr.address2, [addr.city, addr.state].filter(Boolean).join(", "), addr.zip]
    .filter((x) => x && String(x).trim())
    .join(", ");
  const members = (p.members?.memberList ?? []).map((m) => ({
    name:
      personLegalName(m.firstName, m.lastName, m.suffix) || (m.fullLegalName ?? ""),
    address: [m.address1, m.address2, [m.city, m.state].filter(Boolean).join(", "), m.zip]
      .filter((x) => x && String(x).trim())
      .join(", "),
  }));
  const managementStructure = p.management?.structure ?? "";
  // Every MGR entry becomes a Manager. Authorized representatives sign the
  // Articles and manage nothing, so a listed AR must never be named Manager —
  // and the list is not ordered, so taking the first entry named whoever the
  // client happened to type first.
  const managerNames = (p.management?.managersOrAuthorizedRepresentatives ?? [])
    .filter((e) => (e.role ?? "MGR") === "MGR")
    .map((e) =>
      (
        personLegalName(e.firstName, e.lastName, e.suffix) ||
        e.fullName ||
        e.businessEntityName ||
        ""
      ).trim(),
    )
    .filter(Boolean);
  // No fallback. Naming the first member as Manager because the list was
  // empty appoints someone to an office the client never put them in — the
  // same fault as the comment above warns about for authorized
  // representatives, one step removed. The order should never have been
  // accepted without a Manager (server/validation.ts, check 6); if one
  // reaches here, refuse rather than invent.
  if (managementStructure === "MANAGER_MANAGED" && managerNames.length === 0) {
    throw new Error(
      "This order is manager-managed but lists no Manager. Correct the order before generating an agreement.",
    );
  }
  // Series = intake series + any fulfilled portal series orders
  const svcSeries = await db.query<{ details: unknown }>(
    "SELECT details FROM service_orders WHERE client_id = $1 AND type = 'series' AND status IN ('in_progress','fulfilled')",
    [clientId],
  );
  const series: { name: string; purpose: string }[] = (p.series ?? []).map((sr) => ({ name: sr.name, purpose: "" }));
  for (const row of svcSeries) {
    const d = (typeof row.details === "string" ? JSON.parse(row.details) : row.details) as { seriesName?: string; purpose?: string };
    if (d.seriesName && !series.some((sr) => sr.name === d.seriesName)) {
      series.push({ name: d.seriesName, purpose: d.purpose ?? "" });
    }
  }
  return {
    orderId: orders[0].id,
    llcName: p.llcName?.finalName || orders[0].llc_name,
    filingPath: p.filingPath ?? "NEW",
    formationType: p.formationType ?? "",
    managementStructure,
    managerNames,
    principalAddress,
    members,
    series,
  };
}

export const oaAnswersSchema = z.object({
  firstOrAmended: z.enum(["first", "amended"]).optional(),
  sElection: z.boolean().optional(), // true = build on the S corporation form
  // Asked, not derived. The intake list is where the owners START; a client can
  // take on a partner or buy one out before the agreement is written.
  multiOwner: z.boolean().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  authorized: z.boolean().optional(),
  contributionToCompany: z.string().max(300).optional(),
  ownershipMode: z.enum(["percent", "fraction"]).optional(),
  members: z
    .array(
      z.object({
        // Name and address travel WITH the owner. Held in a second array keyed
        // by position, a deletion would shift every share onto the wrong person.
        name: z.string().max(200).optional(),
        address: z.string().max(300).optional(),
        percentage: z.number().min(0).max(100).optional(),
        numerator: z.number().int().min(0).max(100_000).optional(),
        denominator: z.number().int().min(1).max(100_000).optional(),
        contribution: z.string().max(300).optional(),
        todBeneficiary: z.string().max(300).optional(),
      }),
    )
    .max(20)
    .optional(),
  series: z
    .array(
      z.object({
        purpose: z.string().max(300).optional(),
        contribution: z.string().max(300).optional(),
      }),
    )
    .optional(),
  includeCapitalCalls: z.boolean().optional(),
  capitalCallCap: z.number().min(0).max(100_000_000).optional(),
  competition: z.enum(["A", "B"]).optional(),
  includeShotgun: z.boolean().optional(),
  borrowingThreshold: z.number().min(0).max(100_000_000).optional(),
  couples: z
    .array(
      z.object({
        a: z.number().int().min(0),
        b: z.number().int().min(0),
        form: z.enum(["TBE", "JTWROS"]),
        percentage: z.number().min(0).max(100).optional(),
        numerator: z.number().int().min(0).max(100_000).optional(),
        denominator: z.number().int().min(1).max(100_000).optional(),
        contribution: z.string().max(300).optional(),
        todBeneficiary: z.string().max(300).optional(),
      }),
    )
    .max(10)
    .optional(),
})
  // A couple must reference two DISTINCT, EXISTING owners, each in at most one
  // couple. The client-side pickers once let a selection go stale when its
  // owner was deleted before the pair was committed, and a couple referencing
  // a nonexistent index autosaved (Codex OA-PAIR-001). The pickers now
  // sanitize themselves, but no client bug may ever save a ghost couple.
  .superRefine((a, ctx) => {
    const n = a.members?.length ?? 0;
    const seen = new Set<number>();
    for (const [i, cpl] of (a.couples ?? []).entries()) {
      for (const idx of [cpl.a, cpl.b]) {
        if (idx >= n) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["couples", i], message: `Couple references owner ${idx + 1}, but only ${n} owners exist.` });
        }
        if (seen.has(idx)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["couples", i], message: "An owner can be in at most one couple." });
        }
        seen.add(idx);
      }
      if (cpl.a === cpl.b) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["couples", i], message: "A couple needs two different owners." });
      }
    }
  });

export const SPOUSAL_FORM_LABEL: Record<"TBE" | "JTWROS", string> = {
  TBE: "tenants by the entirety",
  JTWROS: "joint tenants with right of survivorship",
};

// Who owns the company, as the client last said. The intake list is only the
// starting point: members are never filed with the Division (server/filing.ts
// has no member field), so nothing about the formation record fixes it. An
// untouched draft carries shares but no names, which is how the two are told
// apart. Every document that names the owners resolves them HERE — otherwise
// two documents generated the same afternoon disagree about who owns the company.
/** A person's printed legal name, suffix set off by a comma — the form's
 *  fullPersonName, server-side. Exhibit A and the signature blocks print
 *  this verbatim, so "John Smith, Jr." must survive the whole path. */
export function personLegalName(first?: string, last?: string, suffix?: string): string {
  const base = [first, last].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  const sfx = (suffix ?? "").trim().replace(/^,\s*/, "");
  if (!base) return sfx;
  return sfx ? `${base}, ${sfx}` : base;
}

export function effectiveOwners(
  seedMembers: { name: string; address: string }[],
  answers: { members?: { name?: string; address?: string }[] } | null | undefined,
): { name: string; address: string }[] {
  const answered = answers?.members ?? [];
  const edited = answered.some((m) => (m.name ?? "").trim() !== "");
  return edited
    ? answered.map((m) => ({ name: (m.name ?? "").trim(), address: (m.address ?? "").trim() }))
    : seedMembers.map((m) => ({ name: m.name, address: m.address }));
}

export async function savedOaAnswers(clientId: string, orderId?: string | null): Promise<{ members?: { name?: string; address?: string }[] } | null> {
  const db = await getDb();
  const rows = orderId
    ? await db.query<{ answers: unknown }>("SELECT answers FROM oa_profiles WHERE client_id = $1 AND order_id = $2", [clientId, orderId])
    : await db.query<{ answers: unknown }>("SELECT answers FROM oa_profiles WHERE client_id = $1 ORDER BY updated_at DESC LIMIT 1", [clientId]);
  if (rows.length === 0) return null;
  const raw = rows[0].answers;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as { members?: { name?: string; address?: string }[] };
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/* --------------------------- portal services --------------------------- */

export const SERVICE_SAFE_COLUMNS =
  "id, type, status, llc_name, details, amount_cents, created_at, paid_at, fulfilled_at";

/** The client's company name comes from their latest paid formation order. */
export async function clientLlcName(clientId: string, orderId?: string | null): Promise<string> {
  const db = await getDb();
  const rows = orderId
    ? await db.query<{ llc_name: string }>(
        "SELECT llc_name FROM orders WHERE client_id = $1 AND id = $2 AND paid_at IS NOT NULL",
        [clientId, orderId],
      )
    : await db.query<{ llc_name: string }>(
        "SELECT llc_name FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at DESC NULLS LAST LIMIT 1",
        [clientId],
      );
  return rows[0]?.llc_name ?? "";
}

/** Resolve the ?company= parameter to one of the client's own paid orders —
 *  or their latest when absent, which is exactly the pre-tabs behavior. */
export async function resolveCompanyOrder(clientId: string, requested: string | undefined): Promise<string | null> {
  const db = await getDb();
  const rows = requested
    ? await db.query<{ id: string }>(
        "SELECT id FROM orders WHERE client_id = $1 AND id = $2 AND paid_at IS NOT NULL",
        [clientId, requested],
      )
    : await db.query<{ id: string }>(
        "SELECT id FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at DESC NULLS LAST LIMIT 1",
        [clientId],
      );
  return rows[0]?.id ?? null;
}

/** Whether the client's LLC is formed — the Articles are in their portal.
 *  Gates the EIN and S-election detail forms: neither IRS process exists
 *  for a company that doesn't. */
export async function clientLlcFormed(clientId: string, orderId?: string | null): Promise<boolean> {
  const db = await getDb();
  // ANY formed order means the LLC exists — a client can have later paid
  // orders (services, extra series) that never carry formed_at themselves.
  // With an orderId, the question is about that company alone: a client's
  // second, not-yet-formed LLC is not formed because the first one is.
  const rows = orderId
    ? await db.query<{ ok: number }>(
        "SELECT 1 AS ok FROM orders WHERE client_id = $1 AND id = $2 AND formed_at IS NOT NULL LIMIT 1",
        [clientId, orderId],
      )
    : await db.query<{ ok: number }>(
        "SELECT 1 AS ok FROM orders WHERE client_id = $1 AND formed_at IS NOT NULL LIMIT 1",
        [clientId],
      );
  return rows.length > 0;
}

/** The client's protected series as full filed names ("LLC - PS 1"):
 *  formation-order series (stored as bare identifiers) plus paid portal
 *  series orders (stored as full names). The EIN dialog offers exactly this
 *  list — a client picks a series they actually have instead of typing one. */
export async function clientSeries(clientId: string, orderId?: string | null): Promise<{ name: string; einOrdered: boolean }[]> {
  const db = await getDb();
  const llcName = await clientLlcName(clientId, orderId ?? undefined);
  if (!llcName) return [];
  const names: string[] = [];
  const formation = orderId
    ? await db.query<{ payload: unknown }>(
        "SELECT payload FROM orders WHERE client_id = $1 AND id = $2 AND paid_at IS NOT NULL ORDER BY paid_at ASC",
        [clientId, orderId],
      )
    : await db.query<{ payload: unknown }>(
        "SELECT payload FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at ASC",
        [clientId],
      );
  for (const r of formation) {
    const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    for (const n of seriesNames(p)) {
      names.push(n.toLowerCase().startsWith(llcName.toLowerCase()) ? n : `${llcName} - ${n}`);
    }
  }
  // Service orders from before company scoping have no formation_order_id;
  // they belong to the client's only company then, so a NULL matches any.
  const svc = orderId
    ? await db.query<{ type: string; details: unknown }>(
        `SELECT type, details FROM service_orders
         WHERE client_id = $1 AND type IN ('series', 'ein') AND status <> 'pending_payment'
           AND (formation_order_id IS NULL OR formation_order_id = $2)`,
        [clientId, orderId],
      )
    : await db.query<{ type: string; details: unknown }>(
        `SELECT type, details FROM service_orders
         WHERE client_id = $1 AND type IN ('series', 'ein') AND status <> 'pending_payment'`,
        [clientId],
      );
  const einSeries = new Set<string>();
  for (const r of svc) {
    const d = (typeof r.details === "string" ? JSON.parse(r.details) : r.details) as {
      seriesName?: string;
      target?: string;
    } | null;
    if (r.type === "series" && d?.seriesName) names.push(d.seriesName);
    if (r.type === "ein" && d?.target === "series" && d.seriesName) einSeries.add(d.seriesName.trim().toLowerCase());
  }
  const seen = new Set<string>();
  const out: { name: string; einOrdered: boolean }[] = [];
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: n.trim(), einOrdered: einSeries.has(k) });
  }
  return out;
}

/** S election package gate: NEW formations we filed, purchasable only through
 *  day 65 after the formation order was paid (the IRS election deadline is
 *  2 months + 15 days — the shorter window leaves time to prepare and mail). */
export async function sElectionEligibility(clientId: string, orderId?: string | null): Promise<{
  eligible: boolean;
  reason: "ok" | "no_new_formation" | "window_closed" | "already_ordered";
  orderBy: string | null;
  formationPaidAt: string | null;
}> {
  const db = await getDb();
  const formed = orderId
    ? await db.query<{ paid_at: unknown }>(
        "SELECT paid_at FROM orders WHERE client_id = $1 AND id = $2 AND paid_at IS NOT NULL AND package = 'NEW' LIMIT 1",
        [clientId, orderId],
      )
    : await db.query<{ paid_at: unknown }>(
        "SELECT paid_at FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL AND package = 'NEW' ORDER BY paid_at DESC NULLS LAST LIMIT 1",
        [clientId],
      );
  if (formed.length === 0 || !formed[0].paid_at) {
    return { eligible: false, reason: "no_new_formation", orderBy: null, formationPaidAt: null };
  }
  const paidAt = new Date(String(formed[0].paid_at));
  const orderBy = new Date(paidAt.getTime() + S_ELECTION_WINDOW_DAYS * 86400_000);
  const existing = orderId
    ? await db.query(
        `SELECT id FROM service_orders WHERE client_id = $1 AND type = 's-election' AND status <> 'cancelled'
           AND (formation_order_id IS NULL OR formation_order_id = $2)`,
        [clientId, orderId],
      )
    : await db.query(
        "SELECT id FROM service_orders WHERE client_id = $1 AND type = 's-election' AND status <> 'cancelled'",
        [clientId],
      );
  if (existing.length > 0) {
    return { eligible: false, reason: "already_ordered", orderBy: orderBy.toISOString(), formationPaidAt: paidAt.toISOString() };
  }
  if (Date.now() > orderBy.getTime()) {
    return { eligible: false, reason: "window_closed", orderBy: orderBy.toISOString(), formationPaidAt: paidAt.toISOString() };
  }
  return { eligible: true, reason: "ok", orderBy: orderBy.toISOString(), formationPaidAt: paidAt.toISOString() };
}

/** How long a client may edit and re-download the S election package before we
 *  destroy it. The package IS the clients' copy of Form 2553, complete with
 *  every owner's Social Security number, so it does not live here longer than
 *  it has to. */
export const S_ELECTION_EDIT_DAYS = 14;

export interface SElectionStoredDetails {
  ein?: string;
  einPending?: boolean;
  dateIncorporated?: string;
  effectiveDate?: string;
  officerName?: string;
  officerTitle?: string;
  phone?: string;
  certifiedAt?: string;
  documentId?: string;
  purgedAt?: string;
  shareholders?: { name: string; address: string; percentage: number; dateAcquired: string; ssnLast4: string }[];
}

/** The edit/download window for one order. Drivers differ: Neon returns ISO
 *  strings, PGlite returns Date objects. */
export function sElectionWindow(fulfilledAt: unknown): { open: boolean; deleteOn: string | null } {
  if (!fulfilledAt) return { open: false, deleteOn: null };
  const start = new Date(String(fulfilledAt)).getTime();
  if (Number.isNaN(start)) return { open: false, deleteOn: null };
  const deleteOn = new Date(start + S_ELECTION_EDIT_DAYS * 86400_000);
  return { open: Date.now() < deleteOn.getTime(), deleteOn: deleteOn.toISOString() };
}

/** When the edit window closes, the Social Security numbers are destroyed —
 *  but the client keeps a record of what was prepared. The package is REBUILT
 *  with only the last four digits of each number and stamped unfileable, and
 *  the encrypted numbers are deleted. Rebuilding rather than editing the old
 *  PDF matters: a black box drawn over text leaves the text underneath, still
 *  extractable. Safe to call on any request. */
export async function purgeExpiredSElections(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - S_ELECTION_EDIT_DAYS * 86400_000).toISOString();
  const rows = await db.query<{ id: string; client_id: string; llc_name: string; details: unknown }>(
    `SELECT id, client_id, llc_name, details FROM service_orders
      WHERE type = 's-election' AND status = 'fulfilled'
        AND fulfilled_at IS NOT NULL AND fulfilled_at < $1
        AND (ein_secret IS NOT NULL OR details->>'purgedAt' IS NULL)`,
    [cutoff],
  );
  for (const row of rows) {
    const d = (typeof row.details === "string" ? JSON.parse(row.details) : row.details) as SElectionStoredDetails;
    const kept: SElectionStoredDetails = { ...d, purgedAt: new Date().toISOString() };

    if (d?.shareholders?.length && d.dateIncorporated && d.effectiveDate) {
      const seed = await oaSeed(row.client_id);
      try {
        const pdf = await buildSElectionPackage({
          llcName: row.llc_name,
          principalAddress: seed?.principalAddress ?? "",
          ein: d.ein ?? "",
          dateIncorporated: d.dateIncorporated,
          effectiveDate: d.effectiveDate,
          officerName: d.officerName ?? "",
          officerTitle: d.officerTitle ?? "",
          phone: d.phone ?? "",
          recordCopy: true,
          // Only the last four survive in the stored record — that is all the
          // record copy can show, and all it needs to.
          shareholders: d.shareholders.map((s) => ({ ...s, ssn: s.ssnLast4 })),
        });
        const title = `S Corporation Election Package — Record Copy — ${row.llc_name}`;
        const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
        const stored = await putFile(`${title.replace(/[^\w-]+/g, "_")}.pdf`, buf, "application/pdf");
        if (d.documentId) {
          const old = await db.query<{ storage_key: string }>(
            "SELECT storage_key FROM documents WHERE id = $1",
            [d.documentId],
          );
          await db.query(
            `UPDATE documents SET title = $1, storage_key = $2, size_bytes = $3 WHERE id = $4`,
            [title, stored.storageKey, stored.sizeBytes, d.documentId],
          );
          if (old[0]?.storage_key) await deleteFile(old[0].storage_key).catch(() => {});
        } else {
          const doc = await db.query<{ id: string }>(
            `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
             VALUES ($1, 'package', $2, $3, 'application/pdf', $4) RETURNING id`,
            [row.client_id, title, stored.storageKey, stored.sizeBytes],
          );
          kept.documentId = doc[0].id;
        }
      } catch (e) {
        // A rebuild that fails must not leave the full-SSN copy in place: drop
        // it, and the client still has whatever they downloaded.
        console.error("[purge] record copy rebuild failed; removing the original:", e);
        if (d.documentId) {
          const old = await db.query<{ storage_key: string }>(
            "SELECT storage_key FROM documents WHERE id = $1",
            [d.documentId],
          );
          await db.query("DELETE FROM documents WHERE id = $1", [d.documentId]);
          if (old[0]?.storage_key) await deleteFile(old[0].storage_key).catch(() => {});
          kept.documentId = undefined;
        }
      }
    }

    await db.query("UPDATE service_orders SET details = $1, ein_secret = NULL WHERE id = $2", [
      JSON.stringify(kept),
      row.id,
    ]);
  }
  if (rows.length > 0) console.log(`[purge] redacted ${rows.length} expired S election package(s)`);
  return rows.length;
}

/** Everything the IRS EIN application asks that the formation record cannot
 *  answer — the objective ledger from the assistant walk + Form SS-4
 *  (Rev. 12-2025), 24 Aug 2026. The IRS requires the responsible party's
 *  name SPLIT (first/middle/last/suffix, "must match IRS records"). */
export const einDetailsSchema = z
  .object({
    responsibleFirst: z.string().min(1, "The responsible party's first name is required.").max(100),
    responsibleMiddle: z.string().max(100).optional().default(""),
    responsibleLast: z.string().min(1, "The responsible party's last name is required.").max(100),
    responsibleSuffix: z.string().max(10).optional().default(""),
    tin: z
      .string()
      .transform((s) => s.replace(/[\s-]/g, ""))
      .refine((s) => /^\d{9}$/.test(s), "Enter a 9-digit SSN or ITIN."),
    phone: z.string().min(7, "A phone number for IRS questions is required.").max(40),
    county: z.string().min(2, "The county of the LLC's principal address is required.").max(60),
    activity: z.enum([
      "Real estate",
      "Rental & leasing",
      "Construction",
      "Retail",
      "Finance & insurance",
      "Health care & social assistance",
      "Accommodation & food service",
      "Transportation & warehousing",
      "Manufacturing",
      "Wholesale",
      "Other",
    ]),
    activityDetail: z
      .string()
      .min(3, "Describe the products or services in a few words — e.g. \"residential rental real estate.\"")
      .max(200),
    employeesExpected: z.boolean(),
    employeeCountOther: z.number().int().min(0).max(9999).optional().default(0),
    employeeCountAg: z.number().int().min(0).max(9999).optional().default(0),
    employeeCountHousehold: z.number().int().min(0).max(9999).optional().default(0),
    firstWageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
    form944Annual: z.boolean().optional().default(false),
    closingMonth: z.enum([
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ]),
    exciseApplies: z.boolean(),
    exciseDetail: z.string().max(300).optional().default(""),
    certified: z.literal(true, {
      errorMap: () => ({ message: "You must confirm the certification before submitting." }),
    }),
  })
  .refine(
    (d) =>
      !d.employeesExpected ||
      (d.firstWageDate !== "" &&
        d.employeeCountOther + d.employeeCountAg + d.employeeCountHousehold > 0),
    { message: "With employees expected, enter the expected count and the first date wages will be paid." },
  )
  .refine((d) => !d.exciseApplies || d.exciseDetail.trim().length > 0, {
    message: "Tell us which of the special activities applies.",
  });

export const sElectionDetailsSchema = z
  .object({
    ein: z
      .string()
      .transform((s) => s.replace(/[\s-]/g, ""))
      .refine((s) => s === "" || /^\d{9}$/.test(s), "Enter the 9-digit EIN, or leave it blank if we're obtaining it."),
    einPending: z.boolean().optional().default(false),
    dateIncorporated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    officerName: z.string().min(1, "The signing officer's name is required.").max(200),
    officerTitle: z.string().min(1).max(100),
    phone: z.string().max(40).optional().default(""),
    shareholders: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          address: z.string().min(1).max(300),
          percentage: z.number().min(0).max(100),
          dateAcquired: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          // Blank means "keep the number already on file" when re-editing; a
          // first submission is rejected below if any are blank.
          ssn: z
            .string()
            .transform((s) => s.replace(/[\s-]/g, ""))
            .refine((s) => s === "" || /^\d{9}$/.test(s), "Each owner's SSN must be 9 digits."),
        }),
      )
      .min(1, "At least one owner is required.")
      .max(7, "The IRS form holds 7 owners — contact us for more."),
    certified: z.literal(true, {
      errorMap: () => ({ message: "You must confirm the certification before submitting." }),
    }),
  })
  .refine((d) => d.ein !== "" || d.einPending, {
    message: "Provide the EIN, or mark that we are obtaining it for you.",
  })
  .refine((d) => Math.abs(d.shareholders.reduce((a, s) => a + s.percentage, 0) - 100) < 0.01, {
    message: "Ownership percentages must total exactly 100%.",
  });

export function registerPortalRoutes(app: Hono) {

app.post("/auth/login", async (c) => {
  if (!(await rateLimit(`login:${clientIp(c)}`, 10, 900_000))) {
    return c.json(err("Too many attempts. Try again in a few minutes.", "RATE_LIMITED"), 429);
  }
  const body = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Email and password are required.", "INVALID_INPUT"), 400);
  const db = await getDb();
  const rows = await db.query<{ id: string; password_hash: string | null }>(
    "SELECT id, password_hash FROM clients WHERE email = $1",
    [body.data.email.toLowerCase()],
  );
  const bad = () => c.json(err("Incorrect email or password.", "BAD_CREDENTIALS"), 401);
  if (rows.length === 0 || !rows[0].password_hash) return bad();
  if (!(await verifyPassword(body.data.password, rows[0].password_hash))) return bad();
  await createSession(c, { clientId: rows[0].id });
  return c.json({ data: { ok: true } });
});

app.post("/auth/logout", async (c) => {
  await destroySession(c);
  return c.json({ data: { ok: true } });
});

app.get("/auth/me", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ email: string; name: string; pending_email: string | null; ra_cancellation_requested_at: string | null }>(
    "SELECT email, name, pending_email, ra_cancellation_requested_at FROM clients WHERE id = $1",
    [session.clientId],
  );
  return c.json({
    data: {
      email: rows[0]?.email ?? "",
      name: rows[0]?.name ?? "",
      pendingEmail: rows[0]?.pending_email ?? null,
      raCancellationRequestedAt: rows[0]?.ra_cancellation_requested_at ?? null,
    },
  });
});

app.post("/auth/forgot", async (c) => {
  if (!(await rateLimit(`forgot:${clientIp(c)}`, 5, 3600_000))) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z.object({ email: z.string().email() }).safeParse(await c.req.json().catch(() => null));
  // Always report success — never reveal whether an account exists.
  if (!body.success) return c.json({ data: { ok: true } });
  const db = await getDb();
  const rows = await db.query<{ id: string }>("SELECT id FROM clients WHERE email = $1", [
    body.data.email.toLowerCase(),
  ]);
  if (rows.length > 0) {
    const { token, tokenHash } = newToken();
    await db.query(
      "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at) VALUES ($1, $2, 'reset_password', $3)",
      [tokenHash, rows[0].id, new Date(Date.now() + 3600_000).toISOString()],
    );
    const mail = resetEmail(`${env.PUBLIC_BASE_URL}/portal/set-password?token=${token}`);
    await sendMail({ to: body.data.email, ...mail });
  }
  return c.json({ data: { ok: true } });
});

app.post("/auth/set-password", async (c) => {
  const body = z
    .object({ token: z.string().min(10), password: z.string().min(8, "Use at least 8 characters.") })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error?.issues[0]?.message ?? "Invalid request", "INVALID_INPUT"), 400);
  }
  const db = await getDb();
  // Only tokens issued FOR setting a password may set one. A verify_email
  // token proves inbox access for verification, not authority to replace the
  // password; accepting any purpose here would also silently grant that power
  // to every token type added later. Consuming the token is the same
  // statement that authorizes the write, so a token can never be spent twice.
  const rows = await db.query<{ token_hash: string; client_id: string }>(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL
        AND purpose IN ('set_password', 'reset_password')
      RETURNING token_hash, client_id`,
    [hashToken(body.data.token)],
  );
  if (rows.length === 0) {
    return c.json(err("This link is invalid or has expired. Use “Forgot password” to get a new one.", "BAD_TOKEN"), 400);
  }
  await db.query("UPDATE clients SET password_hash = $1 WHERE id = $2", [
    await hashPassword(body.data.password),
    rows[0].client_id,
  ]);
  await db.query("DELETE FROM sessions WHERE client_id = $1", [rows[0].client_id]);
  await createSession(c, { clientId: rows[0].client_id });
  return c.json({ data: { ok: true } });
});

/* -------------------------------- portal ------------------------------- */

// The client's companies, newest first — one tab each when there is more
// than one (Adam, 31 Aug 2026).
app.get("/portal/companies", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ id: string; llc_name: string; formed_at: string | null; filing_path: string | null }>(
    `SELECT id, llc_name, formed_at, payload->>'filingPath' AS filing_path
       FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL
      ORDER BY paid_at DESC NULLS LAST`,
    [session.clientId],
  );
  return c.json({ data: rows.map((r) => ({ orderId: r.id, llcName: r.llc_name, formed: !!r.formed_at })) });
});

app.get("/portal/documents", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const docs = await db.query<{
    id: string; kind: string; title: string; size_bytes: number; created_at: string; order_id: string | null;
  }>(
    "SELECT id, kind, title, size_bytes, created_at, order_id FROM documents WHERE client_id = $1 ORDER BY created_at DESC",
    [session.clientId],
  );
  return c.json({ data: docs });
});

app.get("/portal/documents/:id/download", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId && !session?.isAdmin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ storage_key: string; title: string; content_type: string; client_id: string }>(
    "SELECT storage_key, title, content_type, client_id FROM documents WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const doc = rows[0];
  if (!session.isAdmin && doc.client_id !== session.clientId) {
    return c.json(err("Not found", "NOT_FOUND"), 404);
  }
  const stream = await readFileStream(doc.storage_key);
  const filename = doc.title.replace(/[^\w.-]+/g, "_") || "document";
  return new Response(stream as BodyInit, {
    headers: {
      "Content-Type": doc.content_type,
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

app.get("/portal/oa", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const companyId = await resolveCompanyOrder(session.clientId, c.req.query("company"));
  const seed = await oaSeed(session.clientId, companyId);
  if (!seed) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  const db = await getDb();
  const saved = await db.query<{ answers: unknown }>("SELECT answers FROM oa_profiles WHERE client_id = $1 AND order_id = $2", [session.clientId, seed.orderId]);
  const gens = await db.query(
    `SELECT id, document_id, template_version, amended_restated, created_at,
            COALESCE(generation_number, 0) AS generation_number,
            inputs->>'version' AS version
       FROM oa_generations WHERE client_id = $1 AND (order_id = $2 OR order_id IS NULL) ORDER BY created_at DESC`,
    [session.clientId, seed.orderId],
  );
  const savedAnswers =
    saved.length > 0
      ? ((typeof saved[0].answers === "string" ? JSON.parse(saved[0].answers as string) : saved[0].answers) as Record<string, unknown>)
      : {};
  const memberManaged = seed.managementStructure === "MEMBER_MANAGED";
  // Reports where the client actually is, not where they started: an owner
  // added in the portal makes this true even though the intake list had one.
  const multiOwner = effectiveOwners(seed.members, savedAnswers as { members?: { name?: string }[] }).length > 1;
  // The S election is an ANSWER, not a fact about the order, so the seed cannot
  // know it. It reports the two structural facts and the version they imply
  // before any election — never a second, differently-shaped version string.
  const version = oaVersion({ multiOwner, memberManaged, sElection: false });
  return c.json({
    data: {
      seed,
      version,
      multiOwner,
      memberManaged,
      blocked: false,
      templateVersion: OA_TEMPLATE_VERSION,
      answers: savedAnswers,
      generations: gens,
    },
  });
});

app.put("/portal/oa/answers", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = oaAnswersSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid answers.", "INVALID_INPUT"), 400);
  const answersCompanyId = await resolveCompanyOrder(session.clientId, c.req.query("company"));
  if (!answersCompanyId) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  const db = await getDb();
  // A revision, when the client supplies one, makes the write monotonic: an
  // earlier keystroke that arrives late is ignored rather than allowed to bury
  // a newer answer. Callers without a revision keep the old unconditional
  // behaviour and leave the stored revision untouched.
  const revRaw = c.req.query("rev");
  const rev = revRaw !== undefined && revRaw !== "" ? Number(revRaw) : null;
  if (rev !== null && Number.isFinite(rev)) {
    const wrote = await db.query<{ rev: number }>(
      `INSERT INTO oa_profiles (client_id, order_id, answers, rev, updated_at) VALUES ($1, $4, $2, $3, now())
       ON CONFLICT (client_id, order_id) DO UPDATE SET answers = $2, rev = $3, updated_at = now()
         WHERE oa_profiles.rev < $3
       RETURNING rev`,
      [session.clientId, JSON.stringify(body.data), rev, answersCompanyId],
    );
    if (wrote.length === 0) return c.json({ data: { ok: true, stale: true } });
    return c.json({ data: { ok: true, rev } });
  }
  await db.query(
    `INSERT INTO oa_profiles (client_id, order_id, answers, updated_at) VALUES ($1, $3, $2, now())
     ON CONFLICT (client_id, order_id) DO UPDATE SET answers = $2, updated_at = now()`,
    [session.clientId, JSON.stringify(body.data), answersCompanyId],
  );
  return c.json({ data: { ok: true } });
});

app.post("/portal/oa/generate", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!(await rateLimit(`oagen:${session.clientId}`, 10, 3600_000))) {
    return c.json(err("Too many generations. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = oaAnswersSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid answers.", "INVALID_INPUT"), 400);
  const a = body.data;
  const genCompanyId = await resolveCompanyOrder(session.clientId, c.req.query("company"));
  const seed = await oaSeed(session.clientId, genCompanyId);
  if (!seed) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  // The owners are an answer, not a reading of the formation record. Members
  // are never filed with the Division — server/filing.ts has no member field —
  // so the intake list is where the list starts, not what it is fixed to.
  // Untouched drafts carry shares but no names, which is how we tell them apart.
  const owners = effectiveOwners(seed.members, a);
  if (owners.length === 0) {
    return c.json(err("An operating agreement needs at least one owner.", "INVALID_INPUT"), 400);
  }
  if (owners.some((o) => !o.name || !o.address)) {
    return c.json(
      err("Every owner needs a full legal name and an address — both are printed in Exhibit A and the signature block.", "INVALID_INPUT"),
      400,
    );
  }
  const multiOwner = owners.length > 1;
  // The answer to "more than one owner?" and the list itself must agree, or one
  // of the two is wrong and we cannot know which.
  if (a.multiOwner !== undefined && a.multiOwner !== multiOwner) {
    return c.json(
      err(
        a.multiOwner
          ? "You answered that the LLC has more than one owner, but only one is listed. Add the others."
          : "You answered that the LLC has one owner, but more than one is listed. Remove the others.",
        "INVALID_INPUT",
      ),
      400,
    );
  }
  const memberManaged = seed.managementStructure === "MEMBER_MANAGED";
  // Management structure × tax posture, all four structures by both postures.
  // A sole owner CAN be member-managed and often is: managementStructure comes
  // off the formation record, which is what was filed with the Division, and
  // handing a member-managed filer a manager-managed agreement contradicts
  // their own Articles. Until 16 August this collapsed every sole owner onto
  // the manager-managed forms because the member-managed single-member forms
  // did not exist yet.
  const version = oaVersion({ multiOwner, memberManaged, sElection: !!a.sElection });
  if (a.authorized !== true) {
    return c.json(err("Please confirm you are authorized to provide this information.", "INVALID_INPUT"), 400);
  }
  if (!a.effectiveDate) return c.json(err("An effective date is required.", "INVALID_INPUT"), 400);
  if (!a.firstOrAmended) return c.json(err("Choose first agreement or amended and restated.", "INVALID_INPUT"), 400);

  const db = await getDb();
  const priorGens = await db.query<{ created_at: unknown }>(
    "SELECT created_at FROM oa_generations WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1",
    [session.clientId],
  );
  // Drivers differ: Neon returns ISO strings, PGlite returns Date objects.
  const priorDate =
    priorGens.length > 0
      ? new Date(String(priorGens[0].created_at)).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
  // Never reuse a number: it is printed on the PDF, and a client may still hold
  // a copy of an agreement they later deleted. The counter lives on the client,
  // so deleting a row cannot roll it back.
  const bumped = await db.query<{ oa_generation_seq: number }>(
    "UPDATE clients SET oa_generation_seq = oa_generation_seq + 1 WHERE id = $1 RETURNING oa_generation_seq",
    [session.clientId],
  );
  const nextGenerationNumber = Number(bumped[0]?.oa_generation_seq ?? 1);

  // Spousal joint-ownership units: two seed members merge into one marital
  // interest ("A and B, husband and wife, as tenants by the entirety").
  const ownershipMode: OwnershipMode = a.ownershipMode ?? "percent";
  const couples = multiOwner ? (a.couples ?? []) : [];
  const pairedIdx = new Set<number>();
  for (const cpl of couples) {
    if (
      cpl.a === cpl.b ||
      !owners[cpl.a] ||
      !owners[cpl.b] ||
      pairedIdx.has(cpl.a) ||
      pairedIdx.has(cpl.b)
    ) {
      return c.json(err("Invalid spousal pairing.", "INVALID_INPUT"), 400);
    }
    pairedIdx.add(cpl.a);
    pairedIdx.add(cpl.b);
  }
  const coupleAt = (i: number) => couples.find((cpl) => cpl.a === i || cpl.b === i);
  // Names only. The words around them — " as …" — belong to the master's
  // Exhibit A row, not to this file; and Adam's rule is that "John Doe and Jane
  // Doe as tenants by the entirety" is sufficient, so "husband and wife," is
  // gone from the document entirely.
  const coupleName = (cpl: (typeof couples)[number]) =>
    `${owners[cpl.a].name} and ${owners[cpl.b].name}`;

  const members: OaInputs["members"] = [];
  const emittedCouples = new Set<(typeof couples)[number]>();
  owners.forEach((m, i) => {
    const cpl = coupleAt(i);
    if (cpl) {
      if (emittedCouples.has(cpl)) return;
      emittedCouples.add(cpl);
      const cplShare: OwnershipShare = { percentage: cpl.percentage, numerator: cpl.numerator, denominator: cpl.denominator };
      members.push({
        name: coupleName(cpl),
        address: owners[cpl.a].address,
        percentage: shareValue(ownershipMode, cplShare),
        percentageLabel: shareLabel(ownershipMode, cplShare),
        jointHolding: SPOUSAL_FORM_LABEL[cpl.form],
        contribution: cpl.contribution ?? "",
        todBeneficiary: cpl.todBeneficiary
          ? `${cpl.todBeneficiary} (effective at the death of the last surviving spouse)`
          : "",
        signatories: [owners[cpl.a].name, owners[cpl.b].name],
      });
    } else {
      const mShare: OwnershipShare = multiOwner
        ? { percentage: a.members?.[i]?.percentage, numerator: a.members?.[i]?.numerator, denominator: a.members?.[i]?.denominator }
        : { percentage: 100 };
      members.push({
        name: m.name,
        address: m.address,
        percentage: shareValue(multiOwner ? ownershipMode : "percent", mShare),
        percentageLabel: shareLabel(multiOwner ? ownershipMode : "percent", mShare),
        contribution: a.members?.[i]?.contribution ?? "",
        todBeneficiary: a.members?.[i]?.todBeneficiary ?? "",
      });
    }
  });
  const isSCorp =
    version === "s" || version === "member-s" ||
    version === "single-s" || version === "member-single-s";
  if (isSCorp && !multiOwner && !members[0].contribution) {
    // sole owner on the S form: the single flow collects the contribution as contributionToCompany
    members[0].contribution = a.contributionToCompany ?? "";
  }
  // One ownership unit — a couple holding jointly with no third owner — owns
  // the whole company by definition. The questionnaire doesn't ask, so nothing
  // is stored; fill it in rather than failing a total check against nothing.
  if (members.length === 1) {
    members[0].percentage = 100;
    members[0].percentageLabel = "100%";
  }
  if (multiOwner && members.length > 1) {
    // Exact arithmetic: three owners at 1/3 each must total one whole, which
    // no float comparison of 33.33 can honestly report.
    const shares: OwnershipShare[] = [];
    const seenCouples = new Set<(typeof couples)[number]>();
    owners.forEach((_, i) => {
      const cpl = coupleAt(i);
      if (cpl) {
        if (seenCouples.has(cpl)) return;
        seenCouples.add(cpl);
        shares.push({ percentage: cpl.percentage, numerator: cpl.numerator, denominator: cpl.denominator });
      } else {
        shares.push({
          percentage: a.members?.[i]?.percentage,
          numerator: a.members?.[i]?.numerator,
          denominator: a.members?.[i]?.denominator,
        });
      }
    });
    if (!sharesAreComplete(ownershipMode, shares)) {
      return c.json(
        err(
          ownershipMode === "fraction"
            ? "Ownership fractions must add up to exactly one whole."
            : "Percentage interests must total exactly 100%.",
          "INVALID_INPUT",
        ),
        400,
      );
    }
    if (a.competition !== "A" && a.competition !== "B") {
      return c.json(err("Choose a competition alternative.", "INVALID_INPUT"), 400);
    }
    if (a.includeCapitalCalls === undefined || a.includeShotgun === undefined) {
      return c.json(err("Answer the optional-provision questions.", "INVALID_INPUT"), 400);
    }
    if (a.includeCapitalCalls && !a.capitalCallCap) {
      return c.json(err("Set the annual capital-call cap.", "INVALID_INPUT"), 400);
    }
  }
  // s. 5.4 exists in every form except the member-managed single-owner ones —
  // the same predicate oa.ts uses to decide whether to fill $[THRESHOLD]. Until
  // 17 August this check sat inside the multi-owner block, so a sole owner was
  // never asked and the agreement said $25,000 on nobody's authority.
  const hasApprovalGate = !(memberManaged && !multiOwner);
  if (hasApprovalGate && !a.borrowingThreshold) {
    return c.json(err("Set the manager's borrowing limit.", "INVALID_INPUT"), 400);
  }

  // Every Protected Series is wholly owned by the Company (ss. 605.2302(1),
  // 605.2303(2), Fla. Stat.), so a series carries no member-level ownership.
  const series = seed.series.map((sr, i) => ({
    name: sr.name,
    purpose: a.series?.[i]?.purpose ?? sr.purpose ?? "",
    contribution: a.series?.[i]?.contribution ?? "",
  }));

  const inputs: OaInputs = {
    version,
    companyName: seed.llcName,
    principalAddress: seed.principalAddress,
    managerNames: seed.managerNames,
    effectiveDate: fmtDate(a.effectiveDate),
    amendedRestated: a.firstOrAmended === "amended",
    priorAgreementDate: priorDate,
    members,
    series,
    // A sole owner on the S corp form skips the multi-member option questions;
    // sensible defaults: no capital calls, competition permitted, no shotgun.
    includeCapitalCalls: a.includeCapitalCalls ?? (isSCorp && !multiOwner ? false : undefined),
    capitalCallCap: a.capitalCallCap,
    competition: a.competition ?? (isSCorp && !multiOwner ? "B" : undefined),
    includeShotgun: a.includeShotgun ?? (isSCorp && !multiOwner ? false : undefined),
    borrowingThreshold: a.borrowingThreshold,
    contributionToCompany: a.contributionToCompany,
    // ch. 621 companies get the three professional descriptor lines.
    professional: seed.formationType === "PLLC",
    generationNumber: nextGenerationNumber,
  };

  const clients = await db.query<{ email: string; name: string }>("SELECT email, name FROM clients WHERE id = $1", [
    session.clientId,
  ]);
  const client = clients[0];

  let pdf: Uint8Array;
  let title: string;
  // One instant for the footer, the filename, and the portal row, so the three
  // can never disagree by a minute.
  const generatedOn = new Date();
  try {
    const assembled = assembleOa(inputs);
    title = assembled.title;
    pdf = await renderMarkdownPdf({
      markdown: assembled.markdown,
      watermark: {
        name: client?.name || members[0].name,
        email: client?.email ?? "",
        note: OA_TEMPLATE_VERSION,
        generatedAt: stampEastern(generatedOn),
      },
      title,
    });
  } catch (e) {
    console.error("[oa] generation failed:", e);
    return c.json(err("We could not generate the agreement. Our team has been notified.", "GENERATION_FAILED"), 500);
  }

  await db.query(
    `INSERT INTO oa_profiles (client_id, order_id, answers, updated_at) VALUES ($1, $3, $2, now())
     ON CONFLICT (client_id, order_id) DO UPDATE SET answers = $2, updated_at = now()`,
    [session.clientId, JSON.stringify(a), seed.orderId],
  );
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  const stored = await putFile(
    `${title.replace(/[^\w-]+/g, "_")}_${stampForFilename(generatedOn)}.pdf`,
    buf,
    "application/pdf",
  );
  const doc = await db.query<{ id: string }>(
    `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes)
     VALUES ($1, $5, 'package', $2, $3, 'application/pdf', $4) RETURNING id`,
    [session.clientId, title, stored.storageKey, stored.sizeBytes, seed.orderId],
  );
  const gen = await db.query<{ id: string }>(
    `INSERT INTO oa_generations (client_id, order_id, document_id, template_version, amended_restated, inputs, generation_number)
     VALUES ($1, $7, $2, $3, $4, $5, $6) RETURNING id`,
    [session.clientId, doc[0].id, OA_TEMPLATE_VERSION, inputs.amendedRestated, JSON.stringify(inputs), nextGenerationNumber, seed.orderId],
  );
  // `version` names which of the eight masters was used. Without it the only
  // way to know is to re-read the generations list, so nothing that calls this
  // route can tell a correct routing from a wrong one.
  return c.json({ data: { generationId: gen[0].id, documentId: doc[0].id, title, version } });
});

/** Consent + Series Exhibit for a series established after formation.
 *  Regenerating the whole agreement as Amended & Restated also carries the new
 *  exhibit; this produces just the two documents that actually change hands. */
app.post("/portal/series/consent", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = z
    .object({
      seriesName: z.string().min(1).max(300),
      seriesNumber: z.string().min(1).max(40),
      purpose: z.string().max(600).optional().default(""),
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Series name, identifier, and date are required.", "INVALID_INPUT"), 400);

  const seed = await oaSeed(session.clientId);
  if (!seed) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);

  // s. 605.2202 requires every protected series name to begin with the
  // company's full name; a designation filed otherwise is rejected.
  if (!body.data.seriesName.trim().toLowerCase().startsWith(seed.llcName.trim().toLowerCase())) {
    return c.json(
      err(`The series name must begin with "${seed.llcName}" (s. 605.2202, Fla. Stat.).`, "INVALID_INPUT"),
      400,
    );
  }
  if (!hasProtectedSeriesPhrase(body.data.seriesName)) {
    return c.json(
      err('The series name must contain "protected series", "P.S.", or "PS" (s. 605.2202, Fla. Stat.).', "INVALID_INPUT"),
      400,
    );
  }

  const memberManaged = seed.managementStructure === "MEMBER_MANAGED";
  // Same owners the operating agreement uses — a client who added or removed an
  // owner must not get a series document that names the intake list.
  const seriesOwners = effectiveOwners(seed.members, await savedOaAnswers(session.clientId));
  const generatedOn = new Date();
  let pdf: Uint8Array;
  let title: string;
  try {
    const assembled = assembleNewSeries({
      companyName: seed.llcName,
      seriesName: body.data.seriesName.trim(),
      seriesNumber: body.data.seriesNumber.trim(),
      purpose: body.data.purpose,
      effectiveDate: fmtDate(body.data.effectiveDate),
      memberNames: seriesOwners.map((m) => m.name),
      managerNames: seed.managerNames,
      memberManaged,
    });
    title = assembled.title;
    const dbc = await getDb();
    const clients = await dbc.query<{ email: string; name: string }>(
      "SELECT email, name FROM clients WHERE id = $1",
      [session.clientId],
    );
    pdf = await renderMarkdownPdf({
      markdown: assembled.markdown,
      watermark: {
        name: clients[0]?.name || seed.members[0]?.name || "",
        email: clients[0]?.email ?? "",
        note: OA_TEMPLATE_VERSION,
        generatedAt: stampEastern(generatedOn),
      },
      title,
    });
  } catch (e) {
    console.error("[new-series] generation failed:", e);
    return c.json(err("We could not generate the documents. Our team has been notified.", "GENERATION_FAILED"), 500);
  }

  const db = await getDb();
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  const stored = await putFile(
    `${title.replace(/[^\w-]+/g, "_")}_${stampForFilename(generatedOn)}.pdf`,
    buf,
    "application/pdf",
  );
  const doc = await db.query<{ id: string }>(
    `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
     VALUES ($1, 'package', $2, $3, 'application/pdf', $4) RETURNING id`,
    [session.clientId, title, stored.storageKey, stored.sizeBytes],
  );
  return c.json({ data: { documentId: doc[0].id, title } });
});

/** A client may remove a draft they generated. Documents WE posted — the
 *  formation package, EIN letter, legal mail, the 2553 package — are not
 *  reachable here, which keeps the download-only rule intact. */
app.delete("/portal/oa/generations/:id", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string; document_id: string | null }>(
    "SELECT id, client_id, document_id FROM oa_generations WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0 || rows[0].client_id !== session.clientId) {
    return c.json(err("Not found", "NOT_FOUND"), 404);
  }
  if (rows[0].document_id) {
    const docs = await db.query<{ storage_key: string }>(
      "SELECT storage_key FROM documents WHERE id = $1 AND client_id = $2",
      [rows[0].document_id, session.clientId],
    );
    await db.query("DELETE FROM oa_generations WHERE id = $1", [rows[0].id]);
    await db.query("DELETE FROM documents WHERE id = $1 AND client_id = $2", [
      rows[0].document_id,
      session.clientId,
    ]);
    if (docs[0]?.storage_key) await deleteFile(docs[0].storage_key);
  } else {
    await db.query("DELETE FROM oa_generations WHERE id = $1", [rows[0].id]);
  }
  return c.json({ data: { ok: true } });
});

/* ----------------------------- library docs ---------------------------- */

app.get("/portal/library", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query("SELECT key, title, edition, size_bytes, updated_at FROM library_documents ORDER BY title");
  return c.json({ data: rows });
});

app.get("/portal/library/:key/download", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ storage_key: string; title: string; edition: string }>(
    "SELECT storage_key, title, edition FROM library_documents WHERE key = $1",
    [c.req.param("key")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const clients = await db.query<{ email: string; name: string }>("SELECT email, name FROM clients WHERE id = $1", [
    session.clientId,
  ]);
  const src = await readFileStream(rows[0].storage_key);
  const bytes = src instanceof Buffer ? src : Buffer.from(await new Response(src as ReadableStream).arrayBuffer());
  let out: Uint8Array;
  try {
    out = await stampExistingPdf({
      bytes,
      watermark: { name: clients[0]?.name ?? "", email: clients[0]?.email ?? "", note: rows[0].edition },
      title: rows[0].title,
    });
  } catch (e) {
    console.error("[library] stamp failed; serving original:", e);
    out = bytes;
  }
  const filename = rows[0].title.replace(/[^\w.-]+/g, "_");
  return new Response(out as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

app.get("/portal/services", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  await purgeExpiredSElections().catch((e) => console.error("[purge] failed:", e));
  const db = await getDb();
  const svcCompanyId = await resolveCompanyOrder(session.clientId, c.req.query("company"));
  const orders = svcCompanyId
    ? await db.query<{ id: string; type: string; status: string; details: unknown; fulfilled_at: unknown }>(
        `SELECT ${SERVICE_SAFE_COLUMNS} FROM service_orders WHERE client_id = $1
           AND (formation_order_id IS NULL OR formation_order_id = $2) ORDER BY created_at DESC`,
        [session.clientId, svcCompanyId],
      )
    : await db.query<{ id: string; type: string; status: string; details: unknown; fulfilled_at: unknown }>(
        `SELECT ${SERVICE_SAFE_COLUMNS} FROM service_orders WHERE client_id = $1 ORDER BY created_at DESC`,
        [session.clientId],
      );
  // The owner dropdown is built from the owners as the client last stated
  // them: the intake members where those exist (member-managed), overridden
  // by anything answered in the operating-agreement questionnaire — the only
  // ownership source a manager-managed company has.
  const seed = await oaSeed(session.clientId, svcCompanyId);
  const owners = effectiveOwners(seed?.members ?? [], await savedOaAnswers(session.clientId, svcCompanyId));
  return c.json({
    data: {
      llcName: await clientLlcName(session.clientId, svcCompanyId),
      dev: !env.isProd && !env.SQUARE_ACCESS_TOKEN,
      members: owners,
      pricing: {
        seriesCents: SERIES_ADDON_PREP_CENTS + SERIES_ADDON_STATE_CENTS,
        einCents: EIN_FEE_CENTS,
        sElectionCents: S_ELECTION_FEE_CENTS,
        certStatusCents: CERT_STATUS_FEE_CENTS,
        certifiedCopyCents: CERTIFIED_COPY_FEE_CENTS,
      },
      sElection: await sElectionEligibility(session.clientId, svcCompanyId),
      series: await clientSeries(session.clientId, svcCompanyId),
      llcFormed: await clientLlcFormed(session.clientId, svcCompanyId),
      einCompanyOrdered: orders.some((o) => {
        if (o.type !== "ein" || o.status === "pending_payment") return false;
        const d = (typeof o.details === "string" ? JSON.parse(o.details) : o.details) as { target?: string } | null;
        return (d?.target ?? "company") === "company";
      }),
      orders: orders.map((o) => {
        if (o.type !== "s-election") return o;
        const d = (typeof o.details === "string" ? JSON.parse(o.details) : o.details) as SElectionStoredDetails;
        const w = sElectionWindow(o.fulfilled_at);
        return { ...o, editableUntil: w.deleteOn, editable: w.open, documentId: d?.documentId ?? null };
      }),
    },
  });
});

app.post("/portal/services/s-election", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!(await rateLimit(`svc:${session.clientId}`, 20, 3600_000))) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const purchaseCompanyId = await resolveCompanyOrder(session.clientId, c.req.query("company"));
  const llcName = await clientLlcName(session.clientId, purchaseCompanyId);
  if (!llcName) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  const gate = await sElectionEligibility(session.clientId, purchaseCompanyId);
  if (!gate.eligible) {
    const msg =
      gate.reason === "already_ordered"
        ? "You already have an S election order — see your orders below."
        : gate.reason === "window_closed"
          ? "The ordering window for the S election package has closed. A late election requires IRS relief — please consult a tax professional."
          : "The S election package is available only for new LLCs we formed.";
    return c.json(err(msg, gate.reason === "window_closed" ? "WINDOW_CLOSED" : "NOT_ELIGIBLE"), 400);
  }
  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    `INSERT INTO service_orders (client_id, type, llc_name, details, amount_cents, formation_order_id)
     VALUES ($1, 's-election', $2, $3, $4, $5) RETURNING id`,
    [session.clientId, llcName, JSON.stringify({}), S_ELECTION_FEE_CENTS, purchaseCompanyId],
  );
  const serviceOrderId = rows[0].id;
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [session.clientId]);
  const checkout = await createCheckout({
    orderId: serviceOrderId,
    llcName,
    priced: {
      serviceFeeCents: S_ELECTION_FEE_CENTS,
      stateFeesCents: 0,
      totalCents: S_ELECTION_FEE_CENTS,
      lineItems: [{ name: `S corporation election package (Form 2553) — ${llcName}`, amountCents: S_ELECTION_FEE_CENTS }],
    },
    buyerEmail: clients[0]?.email ?? "",
    redirectUrl: `${env.PUBLIC_BASE_URL}/portal?paid=${serviceOrderId}`,
    description: `S corporation election package — ${llcName}`,
  });
  await db.query("UPDATE service_orders SET square_order_id = $1 WHERE id = $2", [
    checkout.squareOrderId,
    serviceOrderId,
  ]);
  return c.json({ data: { serviceOrderId, checkoutUrl: checkout.url, totalCents: S_ELECTION_FEE_CENTS } });
});

app.post("/portal/services/series", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!(await rateLimit(`svc:${session.clientId}`, 20, 3600_000))) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z
    .object({ suffix: z.string().min(1).max(60), purpose: z.string().max(300).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("A series identifier is required.", "INVALID_INPUT"), 400);
  const purchaseCompanyId = await resolveCompanyOrder(session.clientId, c.req.query("company"));
  const llcName = await clientLlcName(session.clientId, purchaseCompanyId);
  if (!llcName) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  const suffix = body.data.suffix.trim().replace(/\s+/g, " ");
  if (!/^[\w .,'&-]+$/.test(suffix)) {
    return c.json(err("The series identifier contains unsupported characters.", "INVALID_INPUT"), 400);
  }
  const seriesName = `${llcName} - ${suffix}`;
  if (!hasProtectedSeriesPhrase(seriesName)) {
    return c.json(
      err('The series name must include "PS", "P.S.", or "protected series" (§605.2202).', "INVALID_INPUT"),
      400,
    );
  }
  const amountCents = SERIES_ADDON_PREP_CENTS + SERIES_ADDON_STATE_CENTS;
  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    `INSERT INTO service_orders (client_id, type, llc_name, details, amount_cents, formation_order_id)
     VALUES ($1, 'series', $2, $3, $4, $5) RETURNING id`,
    [session.clientId, llcName, JSON.stringify({ seriesName, purpose: body.data.purpose ?? "" }), amountCents, purchaseCompanyId],
  );
  const serviceOrderId = rows[0].id;
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [session.clientId]);
  const checkout = await createCheckout({
    orderId: serviceOrderId,
    llcName,
    priced: {
      serviceFeeCents: SERIES_ADDON_PREP_CENTS,
      stateFeesCents: SERIES_ADDON_STATE_CENTS,
      totalCents: amountCents,
      lineItems: [
        { name: `Protected Series Designation (drafting) — ${seriesName}`, amountCents: SERIES_ADDON_PREP_CENTS },
        { name: "FL state fee — Protected Series Designation", amountCents: SERIES_ADDON_STATE_CENTS },
      ],
    },
    buyerEmail: clients[0]?.email ?? "",
    redirectUrl: `${env.PUBLIC_BASE_URL}/portal?paid=${serviceOrderId}`,
    description: `Protected Series Designation — ${seriesName}`,
  });
  await db.query("UPDATE service_orders SET square_order_id = $1 WHERE id = $2", [
    checkout.squareOrderId,
    serviceOrderId,
  ]);
  return c.json({ data: { serviceOrderId, checkoutUrl: checkout.url, totalCents: amountCents } });
});

// State certificates, ordered AFTER formation — the typical time (Adam,
// 30 Aug 2026): a bank or lender asks for a Certificate of Status or a
// Certified Copy once the company exists. Same checkout as every service.
const CERT_TYPES: Record<string, { fee: number; name: string }> = {
  "certificate-of-status": { fee: CERT_STATUS_FEE_CENTS, name: "Certificate of Status" },
  "certified-copy": { fee: CERTIFIED_COPY_FEE_CENTS, name: "Certified Copy of the Articles" },
};
app.post("/portal/services/certificate", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!(await rateLimit(`svc:${session.clientId}`, 20, 3600_000))) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z
    .object({ kind: z.enum(["certificate-of-status", "certified-copy"]) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Choose which document you need.", "INVALID_INPUT"), 400);
  const spec = CERT_TYPES[body.data.kind];
  const purchaseCompanyId = await resolveCompanyOrder(session.clientId, c.req.query("company"));
  const llcName = await clientLlcName(session.clientId, purchaseCompanyId);
  if (!llcName) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  if (!(await clientLlcFormed(session.clientId, purchaseCompanyId))) {
    return c.json(err("The state issues these only for a formed LLC — yours is still in progress.", "NOT_FORMED"), 400);
  }
  const db = await getDb();
  // One OPEN order per kind PER COMPANY: a pending fulfillment refuses a
  // duplicate; a fulfilled one may be re-ordered (banks lose paperwork).
  const open = await db.query<{ id: string }>(
    `SELECT id FROM service_orders
      WHERE client_id = $1 AND type = $2 AND status IN ('in_progress', 'awaiting_info')
        AND (formation_order_id IS NULL OR formation_order_id = $3)`,
    [session.clientId, body.data.kind, purchaseCompanyId],
  );
  if (open.length > 0) {
    return c.json(err(`A ${spec.name.toLowerCase()} is already on order — see your orders below.`, "ALREADY_ORDERED"), 400);
  }
  const rows = await db.query<{ id: string }>(
    `INSERT INTO service_orders (client_id, type, llc_name, details, amount_cents, formation_order_id)
     VALUES ($1, $2, $3, '{}'::jsonb, $4, $5) RETURNING id`,
    [session.clientId, body.data.kind, llcName, spec.fee, purchaseCompanyId],
  );
  const serviceOrderId = rows[0].id;
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [session.clientId]);
  const checkout = await createCheckout({
    orderId: serviceOrderId,
    llcName,
    priced: {
      serviceFeeCents: spec.fee,
      stateFeesCents: 0,
      totalCents: spec.fee,
      lineItems: [{ name: `${spec.name} — ${llcName}`, amountCents: spec.fee }],
    },
    buyerEmail: clients[0]?.email ?? "",
    redirectUrl: `${env.PUBLIC_BASE_URL}/portal?paid=${serviceOrderId}`,
    description: `${spec.name} — ${llcName}`,
  });
  await db.query("UPDATE service_orders SET square_order_id = $1 WHERE id = $2", [
    checkout.squareOrderId,
    serviceOrderId,
  ]);
  return c.json({ data: { serviceOrderId, checkoutUrl: checkout.url, totalCents: spec.fee } });
});

app.post("/portal/services/ein", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!(await rateLimit(`svc:${session.clientId}`, 20, 3600_000))) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z
    .object({ target: z.enum(["company", "series"]), seriesName: z.string().max(300).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Choose what the EIN is for.", "INVALID_INPUT"), 400);
  const purchaseCompanyId = await resolveCompanyOrder(session.clientId, c.req.query("company"));
  const llcName = await clientLlcName(session.clientId, purchaseCompanyId);
  if (!llcName) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  if (body.data.target === "series" && !body.data.seriesName?.trim()) {
    return c.json(err("Name the protected series the EIN is for.", "INVALID_INPUT"), 400);
  }
  const target = body.data.target;
  const seriesName = body.data.seriesName?.trim() ?? "";
  const db = await getDb();
  // One EIN per entity: a paid order (formation-included or portal) for the
  // same target refuses a second purchase. Unpaid drafts don't block — an
  // abandoned checkout must not lock the client out forever.
  const existingEin = await db.query<{ details: unknown }>(
    `SELECT details FROM service_orders
     WHERE client_id = $1 AND type = 'ein' AND status <> 'pending_payment'`,
    [session.clientId],
  );
  const alreadyOrdered = existingEin.some((r) => {
    const d = (typeof r.details === "string" ? JSON.parse(r.details) : r.details) as {
      target?: string;
      seriesName?: string;
    } | null;
    if (target === "company") return (d?.target ?? "company") === "company";
    return d?.target === "series" && (d.seriesName ?? "").trim().toLowerCase() === seriesName.toLowerCase();
  });
  if (alreadyOrdered) {
    return c.json(
      err(
        target === "company"
          ? "Your LLC's EIN is already ordered — see your orders below."
          : "An EIN for that protected series is already ordered — see your orders below.",
        "ALREADY_ORDERED",
      ),
      400,
    );
  }
  // A series target must be one of the client's actual series — the dialog
  // offers only those, and no hand-made request creates an order for a
  // series that does not exist.
  if (target === "series") {
    const mine = await clientSeries(session.clientId, purchaseCompanyId);
    const match = mine.find((s) => s.name.toLowerCase() === seriesName.toLowerCase());
    if (!match) return c.json(err("That protected series is not on your account.", "UNKNOWN_SERIES"), 400);
    if (match.einOrdered) {
      return c.json(err("An EIN for that protected series is already ordered — see your orders below.", "ALREADY_ORDERED"), 400);
    }
  }
  const rows = await db.query<{ id: string }>(
    `INSERT INTO service_orders (client_id, type, llc_name, details, amount_cents, formation_order_id)
     VALUES ($1, 'ein', $2, $3, $4, $5) RETURNING id`,
    [session.clientId, llcName, JSON.stringify({ target, seriesName }), EIN_FEE_CENTS, purchaseCompanyId],
  );
  const serviceOrderId = rows[0].id;
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [session.clientId]);
  const forName = target === "series" ? seriesName : llcName;
  const checkout = await createCheckout({
    orderId: serviceOrderId,
    llcName,
    priced: {
      serviceFeeCents: EIN_FEE_CENTS,
      stateFeesCents: 0,
      totalCents: EIN_FEE_CENTS,
      lineItems: [{ name: `Federal EIN service — ${forName}`, amountCents: EIN_FEE_CENTS }],
    },
    buyerEmail: clients[0]?.email ?? "",
    redirectUrl: `${env.PUBLIC_BASE_URL}/portal?paid=${serviceOrderId}`,
    description: `Federal EIN service — ${forName}`,
  });
  await db.query("UPDATE service_orders SET square_order_id = $1 WHERE id = $2", [
    checkout.squareOrderId,
    serviceOrderId,
  ]);
  return c.json({ data: { serviceOrderId, checkoutUrl: checkout.url, totalCents: EIN_FEE_CENTS } });
});

app.post("/portal/services/:id/ein-details", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = einDetailsSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid details.", "INVALID_INPUT"), 400);
  }
  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string; type: string; status: string; details: unknown; llc_name: string; formation_order_id: string | null }>(
    "SELECT id, client_id, type, status, details, llc_name, formation_order_id FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0 || rows[0].client_id !== session.clientId) {
    return c.json(err("Not found", "NOT_FOUND"), 404);
  }
  const so = rows[0];
  if (so.type !== "ein" || so.status !== "awaiting_info") {
    return c.json(err("This order is not awaiting details.", "BAD_STATE"), 400);
  }
  if (!(await clientLlcFormed(session.clientId, so.formation_order_id))) {
    return c.json(err("Your LLC must be formed before an EIN can be obtained.", "NOT_FORMED"), 400);
  }
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as Record<string, unknown>;
  const d = body.data;
  const merged = {
    ...details,
    responsibleName: [d.responsibleFirst, d.responsibleMiddle, d.responsibleLast, d.responsibleSuffix]
      .filter(Boolean)
      .join(" "),
    responsibleFirst: d.responsibleFirst,
    responsibleMiddle: d.responsibleMiddle,
    responsibleLast: d.responsibleLast,
    responsibleSuffix: d.responsibleSuffix,
    phone: d.phone,
    county: d.county,
    activity: d.activity,
    activityDetail: d.activityDetail,
    employeesExpected: d.employeesExpected,
    employeeCountOther: d.employeeCountOther,
    employeeCountAg: d.employeeCountAg,
    employeeCountHousehold: d.employeeCountHousehold,
    firstWageDate: d.firstWageDate,
    form944Annual: d.form944Annual,
    closingMonth: d.closingMonth,
    exciseApplies: d.exciseApplies,
    exciseDetail: d.exciseDetail,
    tinLast4: d.tin.slice(-4),
    certifiedAt: new Date().toISOString(),
  };
  await db.query(
    "UPDATE service_orders SET details = $1, ein_secret = $2, status = 'in_progress' WHERE id = $3",
    [JSON.stringify(merged), encryptSecret(body.data.tin), so.id],
  );
  if (env.ADMIN_NOTIFY_EMAIL) {
    const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [session.clientId]);
    const summary = `Federal EIN — ${(details.target === "series" ? (details.seriesName as string) : so.llc_name) || so.llc_name}`;
    const mail = einDetailsSubmittedAdminEmail({
      summary,
      clientEmail: clients[0]?.email ?? "",
      adminUrl: `${env.PUBLIC_BASE_URL}/admin`,
    });
    sendMail({ to: env.ADMIN_NOTIFY_EMAIL, ...mail }).catch((e) =>
      console.error("[service] ein-details admin email failed:", e),
    );
  }
  return c.json({ data: { ok: true } });
});

app.post("/portal/services/:id/s-election-details", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = sElectionDetailsSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid details.", "INVALID_INPUT"), 400);
  }
  const db = await getDb();
  const rows = await db.query<{
    id: string; client_id: string; type: string; status: string; llc_name: string;
    details: unknown; ein_secret: string | null; fulfilled_at: unknown; formation_order_id: string | null;
  }>(
    "SELECT id, client_id, type, status, llc_name, details, ein_secret, fulfilled_at, formation_order_id FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0 || rows[0].client_id !== session.clientId) {
    return c.json(err("Not found", "NOT_FOUND"), 404);
  }
  const so = rows[0];
  if (so.type !== "s-election") return c.json(err("Not found", "NOT_FOUND"), 404);
  if (!(await clientLlcFormed(session.clientId, so.formation_order_id))) {
    return c.json(err("Your LLC must be formed before an S election can be made.", "NOT_FORMED"), 400);
  }
  const prior = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as SElectionStoredDetails;
  const editable = so.status === "awaiting_info" || sElectionWindow(so.fulfilled_at).open;
  if (!editable) {
    return c.json(
      err(
        "The two-week window for changing this package has closed, and the details have been deleted. Contact us if you need a new one.",
        "WINDOW_CLOSED",
      ),
      400,
    );
  }
  const d = body.data;

  // A blank SSN means "keep the one already on file" — the browser is never
  // sent a Social Security number back, so an edit does not require retyping
  // them. Position is the only link, so the row count must not have changed.
  let onFile: string[] = [];
  if (so.ein_secret) {
    try {
      onFile = JSON.parse(decryptSecret(so.ein_secret)) as string[];
    } catch (e) {
      console.error("[service] s-election secret decrypt failed:", e);
    }
  }
  const ssns: string[] = [];
  for (let i = 0; i < d.shareholders.length; i++) {
    const typed = d.shareholders[i].ssn;
    const kept = d.shareholders.length === onFile.length ? onFile[i] : "";
    const use = typed || kept;
    if (!/^\d{9}$/.test(use)) {
      return c.json(err("Each owner's SSN must be 9 digits.", "INVALID_INPUT"), 400);
    }
    ssns.push(use);
  }

  // SSNs live only in the encrypted secret; the visible record keeps the last
  // four digits so a row is identifiable without exposing the number.
  const merged: SElectionStoredDetails = {
    ein: d.ein,
    einPending: d.einPending,
    dateIncorporated: d.dateIncorporated,
    effectiveDate: d.effectiveDate,
    officerName: d.officerName,
    officerTitle: d.officerTitle,
    phone: d.phone,
    certifiedAt: new Date().toISOString(),
    documentId: prior?.documentId,
    shareholders: d.shareholders.map((s, i) => ({
      name: s.name,
      address: s.address,
      percentage: s.percentage,
      dateAcquired: s.dateAcquired,
      ssnLast4: ssns[i].slice(-4),
    })),
  };

  // Build the package now — the client downloads it themselves; we file
  // nothing. A failure here must not record a submission that produced no
  // document, so it happens before anything is written.
  const seed = await oaSeed(session.clientId);
  const clients = await db.query<{ email: string; name: string }>(
    "SELECT email, name FROM clients WHERE id = $1",
    [session.clientId],
  );
  let pdf: Uint8Array;
  try {
    pdf = await buildSElectionPackage({
      llcName: so.llc_name,
      principalAddress: seed?.principalAddress ?? "",
      ein: d.ein,
      dateIncorporated: d.dateIncorporated,
      effectiveDate: d.effectiveDate,
      officerName: d.officerName,
      officerTitle: d.officerTitle,
      phone: d.phone,
      shareholders: d.shareholders.map((s, i) => ({
        name: s.name,
        address: s.address,
        percentage: s.percentage,
        dateAcquired: s.dateAcquired,
        ssn: ssns[i],
      })),
    });
  } catch (e) {
    console.error("[service] s-election package build failed:", e);
    return c.json(err("We could not build the package. Our team has been notified.", "GENERATION_FAILED"), 500);
  }

  // Regenerating replaces the earlier PDF rather than stacking copies of the
  // same form, each carrying the owners' Social Security numbers.
  if (prior?.documentId) {
    const old = await db.query<{ storage_key: string }>(
      "SELECT storage_key FROM documents WHERE id = $1 AND client_id = $2",
      [prior.documentId, session.clientId],
    );
    await db.query("DELETE FROM documents WHERE id = $1 AND client_id = $2", [prior.documentId, session.clientId]);
    if (old[0]?.storage_key) await deleteFile(old[0].storage_key).catch(() => {});
  }
  const title = `S Corporation Election Package (Form 2553) — ${so.llc_name}`;
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  const stored = await putFile(
    `${title.replace(/[^\w-]+/g, "_")}_${stampForFilename()}.pdf`,
    buf,
    "application/pdf",
  );
  const docRows = await db.query<{ id: string }>(
    `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
     VALUES ($1, 'package', $2, $3, 'application/pdf', $4) RETURNING id`,
    [session.clientId, title, stored.storageKey, stored.sizeBytes],
  );
  merged.documentId = docRows[0].id;

  // fulfilled_at starts the two-week clock, and a re-edit must not extend it.
  await db.query(
    `UPDATE service_orders
        SET details = $1, ein_secret = $2, status = 'fulfilled',
            fulfilled_at = COALESCE(fulfilled_at, now())
      WHERE id = $3`,
    [JSON.stringify(merged), encryptSecret(JSON.stringify(ssns)), so.id],
  );
  const after = await db.query<{ fulfilled_at: unknown }>(
    "SELECT fulfilled_at FROM service_orders WHERE id = $1",
    [so.id],
  );
  const window = sElectionWindow(after[0]?.fulfilled_at ?? null);

  const mail = sElectionReadyEmail({
    llcName: so.llc_name,
    editableUntil: window.deleteOn ? stampEastern(new Date(window.deleteOn)) : "",
    portalUrl: `${env.PUBLIC_BASE_URL}/portal`,
  });
  sendMail({ to: clients[0]?.email ?? "", ...mail }).catch((e) =>
    console.error("[service] s-election ready email failed:", e),
  );
  if (env.ADMIN_NOTIFY_EMAIL) {
    const adminMail = einDetailsSubmittedAdminEmail({
      summary: `S Corporation Election Package — ${so.llc_name}`,
      clientEmail: clients[0]?.email ?? "",
      adminUrl: `${env.PUBLIC_BASE_URL}/admin`,
    });
    sendMail({ to: env.ADMIN_NOTIFY_EMAIL, ...adminMail }).catch((e) =>
      console.error("[service] s-election-details admin email failed:", e),
    );
  }
  return c.json({ data: { ok: true, documentId: merged.documentId, editableUntil: window.deleteOn } });
});

app.post("/portal/account/password", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!(await rateLimit(`acct:${session.clientId}`, 10, 3600_000))) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, "Use at least 8 characters."),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid request.", "INVALID_INPUT"), 400);
  }
  const db = await getDb();
  const rows = await db.query<{ email: string; password_hash: string | null }>(
    "SELECT email, password_hash FROM clients WHERE id = $1",
    [session.clientId],
  );
  const client = rows[0];
  if (!client?.password_hash || !(await verifyPassword(body.data.currentPassword, client.password_hash))) {
    return c.json(err("That current password is not correct.", "BAD_CREDENTIALS"), 401);
  }
  await db.query("UPDATE clients SET password_hash = $1 WHERE id = $2", [
    await hashPassword(body.data.newPassword),
    session.clientId,
  ]);
  // Sign out every other device; the current session stays valid.
  await db.query("DELETE FROM sessions WHERE client_id = $1 AND token_hash <> $2", [
    session.clientId,
    session.tokenHash,
  ]);
  const mail = passwordChangedEmail(`${env.PUBLIC_BASE_URL}/portal`);
  sendMail({ to: client.email, ...mail }).catch((e) =>
    console.error("[account] password-changed email failed:", e),
  );
  return c.json({ data: { ok: true } });
});

app.post("/portal/account/email", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!(await rateLimit(`acct:${session.clientId}`, 10, 3600_000))) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z
    .object({ newEmail: z.string().email("Enter a valid email address."), currentPassword: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid request.", "INVALID_INPUT"), 400);
  }
  const newEmail = body.data.newEmail.toLowerCase();
  const db = await getDb();
  const rows = await db.query<{ email: string; password_hash: string | null }>(
    "SELECT email, password_hash FROM clients WHERE id = $1",
    [session.clientId],
  );
  const client = rows[0];
  if (!client?.password_hash || !(await verifyPassword(body.data.currentPassword, client.password_hash))) {
    return c.json(err("That password is not correct.", "BAD_CREDENTIALS"), 401);
  }
  if (newEmail === client.email) {
    return c.json(err("That is already the address on your account.", "INVALID_INPUT"), 400);
  }
  const taken = await db.query("SELECT id FROM clients WHERE email = $1", [newEmail]);
  if (taken.length > 0) {
    return c.json(err("That address is already in use on another account.", "EMAIL_TAKEN"), 400);
  }
  const { token, tokenHash } = newToken();
  await db.query("UPDATE clients SET pending_email = $1 WHERE id = $2", [newEmail, session.clientId]);
  // A new request supersedes every outstanding verification link: an unused
  // older token must not survive, or the link sent to inbox A could confirm
  // the address requested later (AUTH-EMAIL-001).
  await db.query(
    "UPDATE auth_tokens SET used_at = now() WHERE client_id = $1 AND purpose = 'verify_email' AND used_at IS NULL",
    [session.clientId],
  );
  await db.query(
    "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at, payload) VALUES ($1, $2, 'verify_email', $3, $4)",
    [tokenHash, session.clientId, new Date(Date.now() + 3600_000).toISOString(), newEmail],
  );
  // The link goes to the new address; the old address gets a warning at the
  // same moment, so a hijacker cannot move an account silently.
  const verify = verifyNewEmail(`${env.PUBLIC_BASE_URL}/portal/verify-email?token=${token}`);
  sendMail({ to: newEmail, ...verify }).catch((e) => console.error("[account] verify email failed:", e));
  const notice = emailChangeRequestedEmail(maskEmail(newEmail));
  sendMail({ to: client.email, ...notice }).catch((e) =>
    console.error("[account] change-requested notice failed:", e),
  );
  return c.json({ data: { ok: true, pendingEmail: newEmail } });
});

app.post("/auth/verify-email", async (c) => {
  const body = z.object({ token: z.string().min(10) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid request.", "INVALID_INPUT"), 400);
  const db = await getDb();
  // Atomic consume: the same UPDATE that authorizes the change spends the
  // token, so it cannot be used twice, concurrently or otherwise.
  const rows = await db.query<{ token_hash: string; client_id: string; payload: string | null }>(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = 'verify_email' AND expires_at > now() AND used_at IS NULL
      RETURNING token_hash, client_id, payload`,
    [hashToken(body.data.token)],
  );
  if (rows.length === 0) {
    return c.json(err("This link is invalid or has expired. Request the change again from your portal.", "BAD_TOKEN"), 400);
  }
  const clients = await db.query<{ email: string; pending_email: string | null }>(
    "SELECT email, pending_email FROM clients WHERE id = $1",
    [rows[0].client_id],
  );
  // The link proves control of the inbox it was SENT to — the address bound
  // into the token — and confirms nothing else. If the account's pending
  // request has moved on (or a legacy token carries no address), the link is
  // dead and the client re-requests (AUTH-EMAIL-001).
  const pending = rows[0].payload;
  if (!pending || clients[0]?.pending_email !== pending) {
    return c.json(err("This link is no longer valid \u2014 the email change was updated after it was sent. Request the change again from your portal.", "BAD_TOKEN"), 400);
  }
  // Someone else may have claimed the address between request and confirmation.
  const taken = await db.query("SELECT id FROM clients WHERE email = $1", [pending]);
  if (taken.length > 0) {
    await db.query("UPDATE clients SET pending_email = NULL WHERE id = $1", [rows[0].client_id]);
    return c.json(err("That address is now in use on another account.", "EMAIL_TAKEN"), 400);
  }
  const previous = clients[0].email;
  await db.query("UPDATE clients SET email = $1, pending_email = NULL WHERE id = $2", [
    pending,
    rows[0].client_id,
  ]);
  const mail = emailChangedEmail(pending);
  sendMail({ to: pending, ...mail }).catch((e) => console.error("[account] email-changed (new) failed:", e));
  sendMail({ to: previous, ...mail }).catch((e) => console.error("[account] email-changed (old) failed:", e));
  return c.json({ data: { ok: true, email: pending } });
});

/** Online cancellation of registered agent service — required by §501.165
 *  because the service is accepted online. Recording the request is the
 *  §9(g)(i) notice; the agency itself ends only when proof of a successor
 *  designation arrives (handled by hand from the admin notification). */
app.post("/portal/registered-agent/cancel", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ email: string; name: string; ra_cancellation_requested_at: string | null }>(
    "SELECT email, name, ra_cancellation_requested_at FROM clients WHERE id = $1",
    [session.clientId],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const client = rows[0];
  if (client.ra_cancellation_requested_at) {
    return c.json({ data: { raCancellationRequestedAt: client.ra_cancellation_requested_at } });
  }
  const updated = await db.query<{ ra_cancellation_requested_at: string }>(
    "UPDATE clients SET ra_cancellation_requested_at = now() WHERE id = $1 RETURNING ra_cancellation_requested_at",
    [session.clientId],
  );
  const requestedAt = updated[0]?.ra_cancellation_requested_at ?? new Date().toISOString();
  // Confirmation + admin notice must not unwind the recorded request.
  const confirmation = raCancellationEmail(client.name);
  sendMail({ to: client.email, ...confirmation }).catch((e) =>
    console.error("ra-cancel confirmation email failed", e),
  );
  if (env.ADMIN_NOTIFY_EMAIL) {
    const notice = raCancellationAdminEmail({ clientName: client.name, clientEmail: client.email });
    sendMail({ to: env.ADMIN_NOTIFY_EMAIL, ...notice, replyTo: client.email }).catch((e) =>
      console.error("ra-cancel admin email failed", e),
    );
  }
  return c.json({ data: { raCancellationRequestedAt: requestedAt } });
});
}
