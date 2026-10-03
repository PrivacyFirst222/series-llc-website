import {prepareCorrectionHistory} from './office-history-recovery';
import {saveDocumentSubmission,DocumentUploadError} from './document-upload';
import {officeFileIdentities} from './office-recovery-sources';
import {verifyOfficeDelivery,OfficeRecoveryError,claimOfficeVerification,officeRecoveryTables,recoverOfficeFile} from './office-file-recovery';
import {registerPublishedArticles,articlesCorrectionState} from './published-articles';
import {requestCertificateDeletion,registerOfficeDocumentHistory} from './document-retention';
import {assertRestoredOfficeAttemptLive,findOfficeOperation,claimOfficeOperation,saveOfficeFile,readOfficeFile,releaseOfficeOperation,officeHash,OfficeConflict,correctOfficeOperation,correctArticlesOperation,cleanupSupersededOfficeFiles} from './office-operation';
import { storeElectionPackage,verifyOfficeElectionPackage } from "./s-election-package-storage";
import { obligationPurpose } from "./agent-obligations";
import { replaceFilingDocument } from "./filing-document-replacement";
import { readOrderBoard, SERVICE_COMPANY_SQL } from "./admin-board";
import { notifyContact, notifyDocument } from './office-notifications';
import { addYears, isoOf as agentIso } from "./renewals";
import { recoveryDetails, notifyTaxpayerNumbersRequired } from "./s-election-recovery";
import { associateLegacyServices, serviceCompanyId } from "./company-scope";
// Split from app.ts on 29 Aug 2026 — one domain per file, code moved
// verbatim (the two dev test flags became shared.testHooks so they stay
// mutable across modules). Routes register inside registerAdminRoutes(app),
// which app.ts calls after creating the app — no circular imports.
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "./db";
import { sortDocuments } from "../src/pages/portal/documentOrder";
import { assembleStatement } from "./statement";
import { renderMarkdownPdf } from "./pdf-render";
import { env } from "./env";
import { listBackups, runDbBackup, backupProgress } from "./backup";
import { mirrorStatus, runFileMirror } from "./dropbox";

import { buildSElectionPackage, type SElectionDetails } from "./s-election";

import { decryptSecret, SecretFormatError } from "./crypto";
import { EncryptionKeyError } from "./encryption";

import { createSession, rateLimit, clientIp } from "./auth";

import { deleteFile, putFile, readFileStream } from "./storage";
import { sendMail, emailChangedEmail, serviceFulfilledClientEmail, sElectionEinAddedEmail, sElectionEinArrivedLateEmail } from "./email";
import { einDigits, fmtEinDisplay, isValidEin } from "../src/lib/ein";
import { filingGroups, seriesNames, AR_SIGNER } from "./filing";
import { err, testHooks, MAX_UPLOAD_BYTES, looksLikePdf, requireAdmin } from "./shared";
import { loadSummaryRow } from "./order-summary";
import { oaSeed, purgeExpiredSElections, postSElectionPackage, sElectionWindow, isoDate, type SElectionStoredDetails } from "./routes-portal";
import { evaluate2553Timing } from "../src/lib/form2553Timing";
import { unpackSsns } from "../src/lib/jointOwner";
import { easternDateIso, stampEastern } from "./datetime";

import { refreshOwnersManual, ensureOwnersManual } from "./owners-manual";
export { refreshOwnersManual } from "./owners-manual";

export function registerAdminRoutes(app: Hono) {
registerPublishedArticles(app,prepareStatement,appointedUs);

// The admin page's view of the same list. It cannot use /portal/library: that
// route requires a CLIENT session, and an admin-only session 401s — which
// rendered the library card as "Not yet published" while the manual was live.
app.get("/admin/library", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  await ensureOwnersManual();
  const rows = await db.query("SELECT key, title, edition, size_bytes, updated_at FROM library_documents ORDER BY title");
  return c.json({ data: rows });
});

app.post("/admin/library/owners-manual/regenerate", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  // "Replace edition" replaces a hand-uploaded manual; otherwise it
  // publishes only when the master differs from what is published, so
  // "Already current" can be true (15 Sep 2026).
  const db = await getDb();
  const cur = await db.query<{ meta: unknown }>("SELECT meta FROM library_documents WHERE key = 'owners-manual'");
  const pinned = !!(cur[0] ? ((typeof cur[0].meta === "string" ? JSON.parse(cur[0].meta) : cur[0].meta) as { pinned?: boolean } | null)?.pinned : false);
  const r = await refreshOwnersManual(pinned);
  return c.json({ data: r });
});

app.post("/admin/library/:key", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const form = await c.req.parseBody();
  const file = form.file;
  const title = typeof form.title === "string" ? form.title.trim() : "";
  const edition = typeof form.edition === "string" ? form.edition.trim() : "";
  if (c.req.param("key") === "owners-manual" && !edition) return c.json(err("Enter the edition label before publishing the manual.", "EDITION_REQUIRED"), 400);
  if (!(file instanceof File) || !title) {
    return c.json(err("title and file are required.", "INVALID_INPUT"), 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) return c.json(err("File is too large (20 MB max).", "TOO_LARGE"), 400);
  // Strict, not claims-based: the portal download layer stamps ".pdf" and
  // serves application/pdf on EVERYTHING it delivers, so a text file that
  // never claimed to be a PDF still reaches the client dressed as one
  // (Codex UPLOAD-003 — the claims-based version of this check let exactly
  // that through). If it will be delivered as a PDF, it must be one.
  if (!(await looksLikePdf(file))) {
    return c.json(err(`${file.name} is not a readable PDF. Everything delivered through the portal is a PDF.`, "NOT_A_PDF"), 400);
  }
  const stored = await putFile(file.name, await file.arrayBuffer(), file.type || "application/pdf");
  const db = await getDb();
  await db.query(
    `INSERT INTO library_documents (key, title, edition, storage_key, content_type, size_bytes, meta, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, '{"pinned":true}'::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET title = $2, edition = $3, storage_key = $4, content_type = $5, size_bytes = $6, meta = '{"pinned":true}'::jsonb, updated_at = now()`,
    [c.req.param("key"), title, edition, stored.storageKey, file.type || "application/pdf", stored.sizeBytes],
  );
  return c.json({ data: { ok: true } });
});

app.get("/admin/file-mirror", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  return c.json({ data: await mirrorStatus() });
});

app.post("/admin/file-mirror/run", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const result = await runFileMirror();
  return c.json({ data: { ...result, status: await mirrorStatus() } });
});

app.get("/admin/backups/progress", async (c) => {
  if (!await requireAdmin(c)) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  return c.json({data:await backupProgress()});
});

app.get("/admin/backups", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  return c.json({ data: await listBackups() });
});

app.post("/admin/backups/run", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  return c.json({ data: await runDbBackup() });
});

// The restore path starts with getting the file — without this route the
// dump is only reachable with the storage token.
app.get("/admin/backups/:key/download", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const key = c.req.param("key");
  const all = await listBackups();
  const hit = all.find((b) => b.key === key);
  if (!hit) return c.json(err("Not found", "NOT_FOUND"), 404);
  const body = await readFileStream(hit.storageKey.startsWith("dev:") ? `dev:backups/${hit.key}` : hit.storageKey);
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${hit.key}"`,
    },
  });
});

/* --------------------------------- admin ------------------------------- */

app.post("/admin/login", async (c) => {
  if (!(await rateLimit(`admin:${clientIp(c)}`, 10, 900_000, "closed"))) {
    return c.json(err("Too many attempts.", "RATE_LIMITED"), 429);
  }
  const body = z.object({ password: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Password required", "INVALID_INPUT"), 400);
  const expected = env.ADMIN_PASSWORD || (!env.isProd ? "dev-admin" : "");
  if (!expected || body.data.password !== expected) {
    return c.json(err("Incorrect password.", "BAD_CREDENTIALS"), 401);
  }
  await createSession(c, { isAdmin: true });
  return c.json({ data: { ok: true } });
});

app.get("/admin/me", async (c) => {
  const admin = await requireAdmin(c);
  return admin ? c.json({ data: { ok: true } }) : c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
});

app.get("/admin/orders", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const q = (c.req.query("q") ?? "").trim().slice(0, 100);
  const view = c.req.query("view") ?? "all";
  const page = Number(c.req.query("page") ?? 1);
  if (!["all", "active", "completed"].includes(view) || !Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
    return c.json(err("Invalid order view or page.", "BAD_REQUEST"), 400);
  }
  return c.json({ data: await readOrderBoard(db, q, view as "all" | "active" | "completed", page) });
});

/** The board's own words for a status, for messages the office reads. */
const BOARD_LABEL: Record<string, string> = { pending_payment: "Pending payment", paid: "New Orders", filed: "With The State", formed: "Formed" };
/** Where a refusal says the order is (15 Sep 2026): a formed order sits in
 *  Post-Filing Items while work is owed, so "in Complete" could be
 *  false; the day it was formed is always true. */
function whereItIs(o: { status: string; formed_at?: string | null }): string {
  if (o.status === "formed" && o.formed_at) return `this order was formed on ${new Date(o.formed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" })}.`;
  return `this one is in ${BOARD_LABEL[o.status] ?? o.status}.`;
}
/** Certificates are bought again and again — "they are only good for a
 *  limited time" (Adam, 15 Sep 2026) — so every copy is titled by the day it
 *  went up and none replaces another. */
const CERT_KINDS = ["certificate-of-status", "certified-copy"] as const;
function certTitle(kindTitle: string, llcName: string): string {
  const day = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  return `${kindTitle} (${day}) — ${llcName}`;
}
const metaOf = (d: { meta: unknown }): Record<string, unknown> =>
  (typeof d.meta === "string" ? JSON.parse(d.meta) : (d.meta as Record<string, unknown> | null)) ?? {};
/** An intake certificate is owed until a copy uploaded from the card exists;
 *  a copy delivered for a portal purchase belongs to that purchase. */
const isCardCert = (d: { kind: string; meta: unknown }, kind: string): boolean => d.kind === kind && metaOf(d).source !== "portal";
const isConversionPayload = (payload: unknown): boolean =>
  ((typeof payload === "string" ? JSON.parse(payload) : payload) as { filingPath?: string } | null)?.filingPath === "CONVERT";

/** Record that the office sent the Articles to the Division. */
app.post("/admin/orders/:id/filed", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ status: string; payload: unknown }>("SELECT status, payload FROM orders WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  // The card hides the button for a conversion; the server refuses too
  // (14 Sep 2026): a conversion has no Articles to send.
  if (isConversionPayload(rows[0].payload)) {
    return c.json(err("An existing-company order has nothing to send to the Division: its Designations are filed online.", "BAD_STATE"), 400);
  }
  if (rows[0].status !== "paid") {
    return c.json(err(`Only an order in New Orders can be marked sent; this order’s filing status is ${rows[0].status}.`, "BAD_STATE"), 400);
  }
  // Submission precedes the stamped Articles: the state returns them days
  // later, so nothing is uploaded before Mark sent (Adam's correction,
  // 30 Aug 2026 — reversing the same-day gate the other way).
  await db.query("UPDATE orders SET status = 'filed', filed_at = now() WHERE id = $1", [
    c.req.param("id"),
  ]);
  return c.json({ data: { ok: true } });
});

/** The Division rejected the filing: the order goes back to New Orders for
 *  refiling, with a dated record of the rejection. */
app.post("/admin/orders/:id/unfiled", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  if (rows[0].status !== "filed") {
    return c.json(err("Only a filing awaiting the State’s decision can be moved back. A formed company appears in Post-Filing Items or New Orders while other work is owed.", "BAD_STATE"), 400);
  }
  // A Division rejection means refiling, usually under the alternate name:
  // every copied-field tick is cleared so the re-copy starts honest, and the
  // series check-off resets with it (Adam, 30 Aug 2026).
  // The rejection leaves a dated record the card shows (14 Sep 2026).
  await db.query("UPDATE orders SET status = 'paid', filed_at = NULL, series_filed_at = NULL, rejected_at = now(), copied_fields = '{}'::jsonb WHERE id = $1", [
    c.req.param("id"),
  ]);
  return c.json({ data: { ok: true } });
});

// The second check-off: the Protected Series Designations are filed only
// after the Division forms the base LLC (Adam, 30 Aug 2026). Idempotent.
app.post("/admin/orders/:id/series-filed", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ id: string; status: string; formed_at: string | null }>("SELECT id, status, formed_at FROM orders WHERE id = $1", [c.req.param("id")]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  // Only while the order is with the State, as the card offers it (14 Sep 2026).
  if (rows[0].status !== "filed") {
    return c.json(err(`Series designations are marked filed while the order is With The State; ${whereItIs(rows[0])}`, "BAD_STATE"), 400);
  }
  await db.query("UPDATE orders SET series_filed_at = COALESCE(series_filed_at, now()) WHERE id = $1", [c.req.param("id")]);
  return c.json({ data: { ok: true } });
});

/** Which fields have been copied into the state's form. Stored per order so an
 *  interrupted filing resumes on whatever machine you pick it up on. */
app.post("/admin/orders/:id/copied", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = z
    .object({ key: z.string().min(1).max(64), copied: z.boolean() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid input.", "INVALID_INPUT"), 400);
  const db = await getDb();
  const rows = await db.query<{ copied_fields: unknown }>(
    "SELECT copied_fields FROM orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const raw = rows[0].copied_fields;
  const marks = (typeof raw === "string" ? JSON.parse(raw) : raw ?? {}) as Record<string, boolean>;
  if (body.data.copied) marks[body.data.key] = true;
  else delete marks[body.data.key];
  await db.query("UPDATE orders SET copied_fields = $1 WHERE id = $2", [
    JSON.stringify(marks),
    c.req.param("id"),
  ]);
  return c.json({ data: { copiedFields: marks } });
});

app.get("/admin/orders/:id", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{
    id: string; client_id: string | null; llc_name: string; status: string;
    payload: unknown; copied_fields: unknown; created_at: string;
    paid_at: string | null; filed_at: string | null; formed_at: string | null;
    contact_name: string; contact_email: string; total_cents: number;
  }>("SELECT * FROM orders WHERE id = $1", [c.req.param("id")]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const o = rows[0];
  const payload = typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload;

  // Documents already delivered for this order, so the panel can show what is
  // covered and what is still owed rather than asking anyone to remember.
  const docs = o.client_id
    ? await db.query<{ id: string; kind: string; title: string; meta: unknown; created_at: string }>(
        `SELECT id, kind, title, meta, created_at FROM documents
          WHERE client_id = $1 AND order_id = $2 AND deleted_at IS NULL ORDER BY created_at`,
        [o.client_id, o.id],
      )
    : [];

  const covered = new Set<string>();
  for (const d of docs) {
    if (d.kind !== "psd") continue;
    const meta = (typeof d.meta === "string" ? JSON.parse(d.meta) : d.meta ?? {}) as {
      seriesNames?: string[];
    };
    for (const n of meta.seriesNames ?? []) covered.add(n);
  }
  const allSeries = seriesNames(payload);

  return c.json({
    data: {
      id: o.id,
      clientId: o.client_id,
      llcName: o.llc_name,
      status: o.status,
      // A conversion files Designations for a company already on file — the
      // drawer confirms that company and skips everything Articles-shaped.
      filingPath: (payload as { filingPath?: string })?.filingPath === "CONVERT" ? "CONVERT" : "NEW",
      existingLlcName: (payload as { existingLlcName?: string })?.existingLlcName ?? "",
      sunbizDocumentNumber: (payload as { sunbizDocumentNumber?: string })?.sunbizDocumentNumber ?? "",
      /** The client appointed us to sign the Articles: the Statement of
       *  Authorized Representative is owed, and the Articles upload needs the
       *  Florida document number to name the company. */
      articlesSignedByUs: appointedUs(payload),
      // Kept because this endpoint used to return the raw row: reshaping it
      // silently dropped square_order_id, the e2e webhook was posted with an
      // undefined order id, and three payment assertions failed. A response
      // shape is a contract even when nobody wrote it down.
      squareOrderId: (o as unknown as { square_order_id: string | null }).square_order_id,
      contactName: o.contact_name,
      contactEmail: o.contact_email,
      totalCents: o.total_cents,
      stateFeesCents: (o as unknown as { state_fees_cents: number }).state_fees_cents,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      filedAt: o.filed_at,
      formedAt: o.formed_at,
      rejectedAt: (o as unknown as { rejected_at: string | null }).rejected_at ?? null,
      // A date, not a midnight timestamp — the same form the portal shows.
      raRenewalDate: (o as unknown as { ra_renewal_date: unknown }).ra_renewal_date ? isoDate((o as unknown as { ra_renewal_date: unknown }).ra_renewal_date) : null,
      seriesFiledAt: (o as unknown as { series_filed_at: string | null }).series_filed_at,
      groups: filingGroups(payload),
      // The stored intake itself — the ground truth the behavioral gate
      // compares every on-screen choice against (P52).
      payload,
      alternateNames: ((payload as { llcName?: { alternateNames?: string[] } }).llcName?.alternateNames ?? []).filter(
        (n) => (n ?? "").trim() !== "",
      ),
      copiedFields:
        (typeof o.copied_fields === "string" ? JSON.parse(o.copied_fields) : o.copied_fields) ?? {},
      series: allSeries.map((name) => ({ name, covered: covered.has(name) })),
      // In the order the client sees them (14 Sep 2026).
      documents: sortDocuments(docs.map((d) => ({ id: d.id, kind: d.kind, title: d.title, source: metaOf(d).source === "portal" ? "portal" : "card", created_at: String(d.created_at) }))).map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        createdAt: d.created_at,
        source: d.source,
      })),
      articlesCorrection: await articlesCorrectionState(db,o.id),
      hasArticles: docs.some((d) => d.kind === "articles"),
      hasStatement: docs.some((d) => d.kind === "statement"),
      articlesPending: ['open','retiring'].includes((await findOfficeOperation(db,'articles',o.id))?.phase??''),
      articlesRetiring: (await findOfficeOperation(db,'articles',o.id))?.phase==='retiring',
      articlesRestoreReviewRequired: ((await findOfficeOperation(db,'articles',o.id))?.payload.restoreReview as {required?:boolean}|undefined)?.required===true,
      articlesSavedDocumentNumber: String((await findOfficeOperation(db,'articles',o.id))?.payload.documentNumber??''),
      articlesRevision: (await findOfficeOperation(db,'articles',o.id))?.id??null,
      pendingCertificateDeletions: await db.query("SELECT d.id,d.title FROM documents d JOIN document_deletions x ON x.document_id=d.id WHERE d.order_id=$1 AND x.completed_at IS NULL AND d.kind IN ('certificate-of-status','certified-copy')",[o.id]),
      certStatusPurchased: !!(payload as { optionalDocuments?: { certificateOfStatus?: boolean } }).optionalDocuments?.certificateOfStatus,
      certifiedCopyPurchased: !!(payload as { optionalDocuments?: { certifiedCopy?: boolean } }).optionalDocuments?.certifiedCopy,
      // Intake certificates count only copies uploaded from the card; a
      // portal purchase is its own obligation (Adam, 15 Sep 2026).
      hasCertStatus: docs.some((d) => isCardCert(d, "certificate-of-status")),
      hasCertifiedCopy: docs.some((d) => isCardCert(d, "certified-copy")),
      // The company's Florida document number, kept with the Articles (or
      // the Statement) when the office typed it (15 Sep 2026).
      documentNumber: String(metaOf(docs.find((d) => d.kind === "articles") ?? { meta: {} }).documentNumber ?? metaOf(docs.find((d) => d.kind === "statement") ?? { meta: {} }).documentNumber ?? ""),
      raService: (payload as { registeredAgent?: { choice?: string } }).registeredAgent?.choice === "SERVICE",
    },
  });
});

function appointedUs(payload: unknown): boolean {
  const p = (typeof payload === "string" ? JSON.parse(payload) : payload) as { certifications?: { articlesSignedBy?: string } } | null;
  return p?.certifications?.articlesSignedBy === "SERVICE";
}
const DOC_NUMBER_NEEDED = "This client appointed us to sign. Enter the Florida document number so the Statement of Authorized Representative can name the company.";
async function prepareStatement(o:{llc_name:string;payload?:unknown},documentNumber:string){
  const { markdown, title, encodedClientText } = assembleStatement({
    companyName: o.llc_name,
    documentNumber: documentNumber.trim(),
    signerName: AR_SIGNER.name,
    signerTitle: AR_SIGNER.title,
    memberManaged: ((typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload) as { management?: { structure?: string } } | null)?.management?.structure !== "MANAGER_MANAGED",
    date: new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" }),
  });
  // Our own statement, not a licensed deliverable: page numbers only.
  const pdf = await renderMarkdownPdf({ markdown, encodedClientText, watermark: null, title });
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return {title,buf};
}
/** Generate and store the Statement beside the company's Articles. Returns
 *  its document id and storage key; callers validate the document number first. */
async function issueStatement(
  db: Awaited<ReturnType<typeof getDb>>,
  o: { id: string; client_id: string | null; llc_name: string; payload?: unknown },
  documentNumber: string,
  put: (name: string, data: ArrayBuffer, type: string) => Promise<{ storageKey: string; sizeBytes: number }> = putFile,
  retirePrior = true,
): Promise<{ id: string; storageKey: string }> {
  const {title,buf}=await prepareStatement(o,documentNumber);
  const stored = await put(`${title.replace(/[^\w-]+/g, "_")}.pdf`, buf, "application/pdf");
  const prior = await db.query<{ id: string; storage_key: string }>(
    "SELECT id, storage_key FROM documents WHERE order_id = $1 AND kind = 'statement'", [o.id]);
  const row = await db.query<{ id: string }>(
    `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes, meta)
     VALUES ($1, $2, 'statement', $3, $4, 'application/pdf', $5, $6) RETURNING id`,
    [o.client_id, o.id, title, stored.storageKey, stored.sizeBytes, JSON.stringify({ documentNumber: documentNumber.trim() })],
  );
  for (const pr of retirePrior ? prior : []) {
    await db.query("DELETE FROM documents WHERE id = $1", [pr.id]);
    await deleteFile(pr.storage_key).catch(() => undefined);
  }
  return { id: row[0].id, storageKey: stored.storageKey };
}

// The filed Articles come back from the Division while the order is With The
// State, and go up here (Adam's sequence, 30 Aug 2026; the card offers the
// upload at that stage only, 14 Sep 2026): the PDF is stored against the
// order, the status does not move, and the client is not emailed — they hear
// once, at formed. A wrong file is replaced later by the formed-step package
// upload, which retires priors.
app.post("/admin/orders/:id/articles", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string | null; llc_name: string; payload: unknown; status: string; formed_at: string | null }>(
    "SELECT id, client_id, llc_name, payload, status, formed_at FROM orders WHERE id = $1", [c.req.param("id")]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const o = rows[0];
  if (!o.client_id) return c.json(err("This order has no client account yet.", "NO_CLIENT"), 400);
  // A conversion has no Articles: refused here as the card refuses to offer
  // it (14 Sep 2026), so no Statement can be issued for a company we never formed.
  if (isConversionPayload(o.payload)) {
    return c.json(err("Adding protected series requires no new Articles of Organization: the company already exists.", "BAD_STATE"), 400);
  }
  // The card offers the upload only while the order is With The State.
  const missingStatement=appointedUs(o.payload)&&(await db.query("SELECT id FROM documents WHERE order_id=$1 AND kind='articles' AND deleted_at IS NULL",[o.id])).length>0&&(await db.query("SELECT id FROM documents WHERE order_id=$1 AND kind='statement' AND deleted_at IS NULL",[o.id])).length===0;
  if (o.status !== "filed"&&!missingStatement) {
    return c.json(err(`The filed Articles are uploaded while the order is With The State; ${whereItIs(o)}`, "BAD_STATE"), 400);
  }
  const existing=await db.query<{id:string;storage_key:string;title:string;size_bytes:number;meta:Record<string,unknown>}>("SELECT * FROM documents WHERE order_id=$1 AND kind='articles' AND deleted_at IS NULL",[o.id]);
  const statements=await db.query("SELECT id FROM documents WHERE order_id=$1 AND kind='statement' AND deleted_at IS NULL",[o.id]);
  const prior=await findOfficeOperation(db,'articles',o.id);
  const form=await c.req.parseBody();
  const file=form.articles instanceof File?form.articles:null;
  const weSigned=appointedUs(o.payload);
  if(existing.length&&(!weSigned||statements.length)&&!prior)return c.json(err("Articles are already uploaded for this order.","ALREADY_UPLOADED"),409);
  const documentNumber=String(form.documentNumber||prior?.payload.documentNumber||existing[0]?.meta?.documentNumber||'').trim();
  if(weSigned&&!documentNumber)return c.json(err(DOC_NUMBER_NEEDED,"DOCUMENT_NUMBER_REQUIRED"),400);
  if(documentNumber&&!/^L\d{11}$/.test(documentNumber))return c.json(err("A Florida LLC document number is the letter L followed by eleven digits, like L26000123456. Use the digit zero, not the letter o.","DOCUMENT_NUMBER_SHAPE"),400);
  if(file&&(file.size>MAX_UPLOAD_BYTES||!(await looksLikePdf(file))))return c.json(err("This is not a readable PDF under 20 MB. Upload the filed Articles from Sunbiz.","NOT_A_PDF"),400);
  if(!file&&!existing.length&&!prior?.files.articles)return c.json(err("The Articles of Organization PDF is required.","INVALID_INPUT"),400);
  const bytes=file?Buffer.from(await file.arrayBuffer()):null;
  let op:Awaited<ReturnType<typeof claimOfficeOperation>>|undefined;
  try{
    const correctionOf=typeof form.correctionOf==='string'?form.correctionOf:'';
    const hash=officeHash({documentNumber,pdf:(prior?prior.payload.existingId:existing[0]?.id)||bytes?.toString('base64')});
    if(correctionOf){
      if(!bytes)throw new OfficeConflict('Choose the corrected Articles PDF.','UPLOAD_REQUIRED');
      await correctArticlesOperation(db,o.id,correctionOf,hash,{documentNumber,weSigned,existingId:null});
      await cleanupSupersededOfficeFiles(db);
    }
    op=await claimOfficeOperation(db,'articles',o.id,!file&&prior?null:hash,{documentNumber,weSigned,existingId:existing[0]?.id??null},false,form.reviewRestoredOriginal==='true');
    if(op.phase==='done'){await verifyOfficeDelivery(db,op,bytes?{slot:op.kind==='articles'?'articles':'upload',bytes}:undefined);await releaseOfficeOperation(db,op);return c.json({data:op.result});}
    // The request may have read the old filing before another writer finished.
    // Recheck after taking the reservation, before writing any document bytes.
    const liveDocuments=await db.query<{id:string;kind:string}>("SELECT id,kind FROM documents WHERE order_id=$1 AND kind IN ('articles','statement') AND deleted_at IS NULL",[o.id]);
    const liveArticles=liveDocuments.filter(d=>d.kind==='articles');
    const expectedArticles=op.payload.existingId;
    if(liveDocuments.some(d=>d.kind==='statement')||
      (expectedArticles?liveArticles.length!==1||liveArticles[0].id!==expectedArticles:liveArticles.length!==0)){
      // An unused claim has no recovery bytes to retain. Clear only our own
      // still-live lease and reservation; never discard a staged file intent.
      await db.query(`WITH abandoned AS (DELETE FROM office_operations
        WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='open' AND files='{}'::jsonb
        AND coalesce(payload->'fileIntents','{}'::jsonb)='{}'::jsonb RETURNING id)
        UPDATE orders SET office_upload_id=NULL WHERE id=$3 AND office_upload_id IN (SELECT id FROM abandoned)`,[op.id,op.lease,o.id]);
      throw new OfficeConflict('The filing documents changed before this upload was reserved. Reload the order.','OFFICE_CONFLICT');
    }
    // A pre-repair partial upload already owns its Articles. Repair only its
    // missing Statement; a new operation publishes both references together.
    if(!op.payload.existingId&&!op.files.articles){
      if(!bytes)throw new OfficeConflict('Select the original Articles PDF to resume this upload.','UPLOAD_REQUIRED');
      await saveOfficeFile(db,op,'articles',bytes,{kind:'articles',title:`Articles of Organization — ${o.llc_name}`,meta:{documentNumber:op.payload.documentNumber}});
    }
    if(op.payload.weSigned&&!op.files.statement){
      // Fix the generated bytes before storage. An expired renderer cannot
      // overwrite the winner with a freshly dated/generated version.
      if(!op.payload.statementPdf){
        const prepared=await prepareStatement(o,String(op.payload.documentNumber));
        const [intent]=await db.query<{payload:Record<string,unknown>}>(`UPDATE office_operations SET payload=payload||$3::jsonb WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='open' RETURNING payload`,[op.id,op.lease,JSON.stringify({statementPdf:Buffer.from(prepared.buf).toString('base64'),statementTitle:prepared.title})]);
        if(!intent)throw new OfficeConflict('Another request resumed this work. Reload and retry.');op.payload=intent.payload;
      }
      await saveOfficeFile(db,op,'statement',Buffer.from(String(op.payload.statementPdf),'base64'),{kind:'statement',title:String(op.payload.statementTitle),meta:{documentNumber:op.payload.documentNumber}});
    }
    if(bytes&&op.files.articles)await saveOfficeFile(db,op,'articles',bytes,{kind:'articles',title:op.files.articles.title,meta:op.files.articles.meta});
    if(op.files.statement&&op.payload.statementPdf)await saveOfficeFile(db,op,'statement',Buffer.from(String(op.payload.statementPdf),'base64'),{kind:'statement',title:op.files.statement.title,meta:op.files.statement.meta});
    const files=Object.values(op.files);
    for(const saved of files)await readOfficeFile(saved);
    // Pending uploads from the previous release have no per-file digest.
    // Their immutable intent still proves the exact original Articles bytes.
    if(op.files.articles&&!op.payload.existingId){
      const original=await readOfficeFile(op.files.articles);
      if(officeHash({documentNumber:op.payload.documentNumber,pdf:original.toString('base64')})!==op.input_hash)throw new OfficeConflict('The saved Articles differ from the original. Select the original PDF and retry.','UPLOAD_REQUIRED');
    }
    const [done]=await db.query(`WITH operation AS (SELECT * FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='open' FOR UPDATE), owner AS (
      UPDATE orders SET office_upload_id=NULL WHERE id=$3 AND office_upload_id=$1 AND replacing_at IS NULL AND status IN ('filed','formed') AND EXISTS(SELECT 1 FROM operation) RETURNING id), inserted AS (
      INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta)
      SELECT f.id,$4,$3,f.kind,f.title,f.key,'application/pdf',f.size,f.meta FROM jsonb_to_recordset($5::jsonb) AS f(id uuid,kind text,title text,key text,size int,meta jsonb) WHERE EXISTS(SELECT 1 FROM owner) RETURNING id)
      UPDATE office_operations SET phase='done',payload=payload-'statementPdf',result=$6,lease=NULL,lease_until=NULL WHERE id=$1 AND EXISTS(SELECT 1 FROM owner) AND (SELECT count(*) FROM inserted)=$7 RETURNING result`,[op.id,op.lease,o.id,o.client_id,JSON.stringify(files),JSON.stringify({ok:true,statement:!!op.payload.weSigned}),files.length]);
    if(!done)throw new OfficeConflict('The filing changed while saving. Reload and retry.');
    return c.json({data:{ok:true,statement:!!op.payload.weSigned}});
  }catch(e){if(op)await releaseOfficeOperation(db,op,e);if(e instanceof OfficeRecoveryError)return c.json(err(e.message,e.code),e.status);if(e instanceof OfficeConflict)return c.json(err(e.message,e.code),409);throw e;}

});

/** The state's certificates on their own (Adam, 7 Sep 2026: "I uploaded the
 *  files for the certificate of status and certified copies but there's no
 *  upload document button"). They often arrive before the designations, so
 *  they no longer have to wait for the formation upload. Each replaces an
 *  earlier copy of its kind, lands under the company, and the client is
 *  told a document was posted. Nothing else about the order changes. */
app.post("/admin/orders/:id/certificates", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string | null; llc_name: string; status: string; payload: unknown }>(
    "SELECT id, client_id, llc_name, status, payload FROM orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const o = rows[0];
  if (!o.client_id) return c.json(err("This order has no client account yet.", "NO_CLIENT"), 400);
  if (o.status === "pending_payment") return c.json(err("This order has not been paid.", "BAD_STATE"), 400);
  const form = await c.req.parseBody();
  const notify = form.notify !== "false";
  const payloadOpts = ((typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload) as {
    optionalDocuments?: { certificateOfStatus?: boolean; certifiedCopy?: boolean };
  }).optionalDocuments;
  const files: { kind: string; title: string; file: File }[] = [];
  for (const [field, kind, key, title] of [
    ["certStatus", "certificate-of-status", "certificateOfStatus", "Certificate of Status"],
    ["certifiedCopy", "certified-copy", "certifiedCopy", "Certified Copy of the Articles"],
  ] as const) {
    const f = form[field];
    if (f instanceof File && f.size > 0) {
      if (!payloadOpts?.[key]) {
        return c.json(err(`The client did not purchase a ${title.toLowerCase()} with this order.`, "NOT_PURCHASED"), 400);
      }
      if (f.size > MAX_UPLOAD_BYTES) return c.json(err("File is too large (20 MB max).", "TOO_LARGE"), 400);
      if (!(await looksLikePdf(f))) return c.json(err(`${f.name} is not a readable PDF.`, "NOT_A_PDF"), 400);
      files.push({ kind, title: certTitle(title, o.llc_name), file: f });
    }
  }
  if (files.length === 0) return c.json(err("Choose a certificate file to upload.", "INVALID_INPUT"), 400);
  const uploaded: string[] = [];
  const uploadedIds: string[] = [];
  for (const cf of files) {
    // Another copy, dated; earlier copies stay until the office deletes
    // them (Adam, 15 Sep 2026).
    const stored = await putFile(cf.file.name, await cf.file.arrayBuffer(), cf.file.type || "application/pdf");
    const inserted = await db.query<{id:string}>(
      `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{"source":"card"}'::jsonb) RETURNING id`,
      [o.client_id, o.id, cf.kind, cf.title, stored.storageKey, cf.file.type || "application/pdf", stored.sizeBytes],
    );
    uploaded.push(cf.kind);
    uploadedIds.push(inserted[0].id);
  }
  let notified = false;
  if (notify) {
    await db.query("UPDATE documents SET meta=meta || '{\"noticeKind\":\"document\"}'::jsonb,notice_status='pending' WHERE id=$1",[uploadedIds[0]]);
    notified = await notifyDocument(uploadedIds[0]);
  }
  return c.json({ data: { uploaded, notified } });
});

/** The Articles and the Protected Series Designations, in one action.
 *
 *  This is the only way an order becomes "formed": the same request that writes
 *  the documents sets the status and emails the client, so the board can never
 *  show a completed order whose client has an empty portal. One PSD document may
 *  cover several series — Florida allows it — so coverage is declared per file
 *  and checked against the order's own series list. Miss one and this refuses. */
app.post("/admin/orders/:id/formation-documents", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{
    id: string; client_id: string | null; llc_name: string; status: string; payload: unknown;
  }>("SELECT id, client_id, llc_name, status, payload FROM orders WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const o = rows[0];
  if (!o.client_id) return c.json(err("This order has no client account yet.", "NO_CLIENT"), 400);
  if (o.status === "pending_payment") {
    return c.json(err("This order has not been paid.", "BAD_STATE"), 400);
  }

  const form = await c.req.parseBody({ all: true });
  const maybeArticles = form.articles;
  const articles = maybeArticles instanceof File ? maybeArticles : null;
  const suppliedDocNumber = typeof form.documentNumber === "string" ? form.documentNumber.trim() : "";
  if (suppliedDocNumber && !/^L\d{11}$/.test(suppliedDocNumber)) {
    return c.json(err("A Florida LLC document number is the letter L followed by eleven digits, like L26000123456. Use the digit zero, not the letter o.", "DOCUMENT_NUMBER_SHAPE"), 400);
  }
  const existingNumbers = articles ? await db.query<{meta: unknown}>(
    "SELECT meta FROM documents WHERE order_id=$1 AND kind IN ('articles','statement') AND deleted_at IS NULL ORDER BY CASE WHEN kind='articles' THEN 0 ELSE 1 END, created_at DESC", [o.id]) : [];
  const priorDocNumber = existingNumbers.map(d => String(metaOf(d).documentNumber ?? "")).find(n => /^L\d{11}$/.test(n)) ?? "";
  const formedDocNumber = suppliedDocNumber || priorDocNumber;
  const formedWeSigned = appointedUs(o.payload);
  if (articles && formedWeSigned && !formedDocNumber) {
    return c.json(err(DOC_NUMBER_NEEDED, "DOCUMENT_NUMBER_REQUIRED"), 400);
  }
  // A conversion designates series for a company already on file: there are
  // no new Articles, and the Division's online designation filing is all
  // there is (dos.fl.gov, "About Florida Series LLCs"; Adam, 9 Sep 2026).
  const isConversion =
    ((typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload) as { filingPath?: string } | null)?.filingPath === "CONVERT";
  if (!articles && !isConversion) {
    // The Articles went up at the With-The-State step; here only the
    // designations arrive. Without the Articles on file, nothing can be formed.
    const already = await db.query<{ id: string }>(
      "SELECT id FROM documents WHERE order_id = $1 AND kind = 'articles' AND deleted_at IS NULL", [o.id]);
    if (already.length === 0) {
      return c.json(err("The Articles of Organization PDF is required.", "INVALID_INPUT"), 400);
    }
  }
  if(!articles&&!isConversion&&formedWeSigned&&!(await db.query("SELECT id FROM documents WHERE order_id=$1 AND kind='statement' AND deleted_at IS NULL",[o.id])).length)return c.json(err("Statement of Authorized Representative — missing. Retry the Articles upload before completing formation.","STATEMENT_REQUIRED"),409);
  if((await findOfficeOperation(db,'articles',o.id))?.phase==='open')return c.json(err("The Articles upload is unfinished. Resume it before completing formation.","ARTICLES_PENDING"),409);
  // psd[] files, each with a matching psdSeries[] entry: a JSON array of the
  // series names that file designates.
  const psdFiles = (Array.isArray(form["psd"]) ? form["psd"] : [form["psd"]]).filter(
    (f): f is File => f instanceof File,
  );
  // The state certificates ride the same upload (Adam, 30 Aug 2026): one
  // optional slot each, only meaningful when the client bought them.
  const certFiles: { kind: string; title: string; file: File }[] = [];
  const payloadOpts = ((typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload) as {
    optionalDocuments?: { certificateOfStatus?: boolean; certifiedCopy?: boolean };
  }).optionalDocuments;
  for (const [field, kind, key, title] of [
    ["certStatus", "certificate-of-status", "certificateOfStatus", "Certificate of Status"],
    ["certifiedCopy", "certified-copy", "certifiedCopy", "Certified Copy of the Articles"],
  ] as const) {
    const f = form[field];
    if (f instanceof File && f.size > 0) {
      if (!payloadOpts?.[key]) {
        return c.json(err(`The client did not purchase a ${title.toLowerCase()} with this order.`, "NOT_PURCHASED"), 400);
      }
      certFiles.push({ kind, title: certTitle(title, o.llc_name), file: f });
    }
  }
  const psdSeriesRaw = (
    Array.isArray(form["psdSeries"]) ? form["psdSeries"] : [form["psdSeries"]]
  ).filter((v): v is string => typeof v === "string");
  if (psdFiles.length === 0) {
    return c.json(err("At least one Protected Series Designation is required.", "INVALID_INPUT"), 400);
  }
  if (psdFiles.length !== psdSeriesRaw.length) {
    return c.json(err("Every designation must say which series it covers.", "INVALID_INPUT"), 400);
  }
  let psdSeries: string[][];
  try {
    psdSeries = psdSeriesRaw.map((s) => JSON.parse(s) as string[]);
  } catch {
    return c.json(err("Series coverage was not readable.", "INVALID_INPUT"), 400);
  }

  const payload = typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload;
  const required = seriesNames(payload);
  const covered = new Set(psdSeries.flat());
  const missing = required.filter((n) => !covered.has(n));
  if (missing.length > 0) {
    return c.json(
      err(
        `No designation covers: ${missing.join(", ")}. Every series on the order must be designated before it can be marked formed.`,
        "SERIES_UNCOVERED",
      ),
      400,
    );
  }

  const files = [...(articles ? [articles] : []), ...psdFiles, ...certFiles.map((cf) => cf.file)];
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) {
      return c.json(err(`${f.name} is too large (20 MB max).`, "TOO_LARGE"), 400);
    }
    if (!(await looksLikePdf(f))) {
      return c.json(err(`${f.name} is not a readable PDF. Filed Articles and designations must be the PDFs from Sunbiz.`, "NOT_A_PDF"), 400);
    }
  }

  // Retry convergence, staged. No cross-statement transaction exists (Neon
  // HTTP driver) and storage interleaves with the inserts, so the ordering IS
  // the safety: (1) store every replacement file, (2) insert the new rows,
  // (3) only then delete the prior rows and blobs, (4) set formed last. A
  // failure at any step leaves the COMPLETE prior package in place (the first
  // version of this fix deleted the old package before writing the new one,
  // which a mid-replacement failure would have turned into a formed order
  // with an empty portal — Codex FORM-001, second finding). The worst
  // surviving state is a brief window where a retry shows both packages;
  // duplicates beat destruction, and the next retry converges.
  // One replacement at a time per order: two concurrent submissions both
  // succeeded and produced a doubled package and doubled completion emails
  // (Codex FORM-002). The claim is a single atomic UPDATE — the same pattern
  // that serializes payment fulfillment — and a stale claim self-releases
  // after ten minutes so a crashed attempt cannot wedge the order.
  const claim = await db.query<{ id: string }>(
    `UPDATE orders SET replacing_at = now(), office_upload_id=NULL
      WHERE id = $1 AND (office_upload_id IS NULL OR EXISTS(SELECT 1 FROM office_operations WHERE id=orders.office_upload_id AND phase='done')) AND (replacing_at IS NULL OR replacing_at < now() - interval '10 minutes')
      RETURNING id`,
    [o.id],
  );
  if (claim.length === 0) {
    return c.json(err("A replacement for this order is already being processed.", "REPLACEMENT_IN_PROGRESS"), 409);
  }
  try {

  // When no new Articles arrive, the existing Articles document survives the
  // retirement of the prior package — deleting it would form an order whose
  // portal has no Articles.
  // Certificates are never retired: every copy stays (Adam, 15 Sep 2026).
  const retiredKinds = ["psd", ...(articles ? ["articles"] : []), ...(articles && formedWeSigned ? ["statement"] : [])];
  const priorDocs = await db.query<{ id: string; storage_key: string }>(
    "SELECT id, storage_key FROM documents WHERE order_id = $1 AND kind = ANY($2::text[]) AND deleted_at IS NULL",
    [o.id, retiredKinds],
  );
  const newKeys: string[] = [];
  let formationPuts = 0;
  const stagedPut = async (name: string, data: ArrayBuffer, type: string) => {
    if (testHooks.failFormationPutAfter >= 0 && formationPuts >= testHooks.failFormationPutAfter) {
      testHooks.failFormationPutAfter = -1;
      throw new Error("dev: injected formation storage failure");
    }
    formationPuts += 1;
    const stored = await putFile(name, data, type);
    newKeys.push(stored.storageKey);
    return stored;
  };

  // If the new package fails partway, undo whatever of it landed — rows
  // first, then blobs best-effort — so the client's portal shows exactly the
  // intact prior package, not a hybrid.
  const newRows: string[] = [];
  try {
    if (articles) {
      const storedArticles = await stagedPut(
        articles.name,
        await articles.arrayBuffer(),
        articles.type || "application/pdf",
      );
      const artRow = await db.query<{ id: string }>(
        `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes, meta)
         VALUES ($1, $2, 'articles', $3, $4, $5, $6, $7) RETURNING id`,
        [
          o.client_id,
          o.id,
          `Articles of Organization — ${o.llc_name}`,
          storedArticles.storageKey,
          articles.type || "application/pdf",
          storedArticles.sizeBytes,
          JSON.stringify(formedDocNumber ? {documentNumber: formedDocNumber} : {}),
        ],
      );
      newRows.push(artRow[0].id);
      if (formedWeSigned) {
        const st = await issueStatement(db, o, formedDocNumber, stagedPut, false);
        newRows.push(st.id);
      }
    }
    for (const cf of certFiles) {
      const storedCert = await stagedPut(cf.file.name, await cf.file.arrayBuffer(), cf.file.type || "application/pdf");
      const certRow = await db.query<{ id: string }>(
        `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '{"source":"card"}'::jsonb) RETURNING id`,
        [o.client_id, o.id, cf.kind, cf.title, storedCert.storageKey, cf.file.type || "application/pdf", storedCert.sizeBytes],
      );
      newRows.push(certRow[0].id);
    }
    for (let i = 0; i < psdFiles.length; i += 1) {
      const f = psdFiles[i];
      const names = psdSeries[i];
      const stored = await stagedPut(f.name, await f.arrayBuffer(), f.type || "application/pdf");
      const psdRow = await db.query<{ id: string }>(
        `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes, meta)
         VALUES ($1, $2, 'psd', $3, $4, $5, $6, $7) RETURNING id`,
        [
          o.client_id,
          o.id,
          `Protected Series Designation — ${names.join(", ")} — ${o.llc_name}`,
          stored.storageKey,
          f.type || "application/pdf",
          stored.sizeBytes,
          JSON.stringify({ seriesNames: names }),
        ],
      );
      newRows.push(psdRow[0].id);
    }
  } catch (e) {
    if (newRows.length > 0) {
      await db
        .query("DELETE FROM documents WHERE id = ANY($1::uuid[])", [newRows])
        .catch((err) => console.error("[formation] compensation delete failed:", err));
    }
    for (const k of newKeys) {
      await deleteFile(k);
    }
    throw e;
  }

  // Published office originals remain recoverable history when this older
  // formation entry point replaces them. Removing their owning rows would
  // invalidate the immutable operation identity for the entire backup.
  if (priorDocs.length > 0) {
    const retained=await db.query<{id:string}>(`UPDATE documents d SET deleted_at=now(),meta=meta||'{"officeHistory":true}'::jsonb
      WHERE d.id=ANY($1::uuid[]) AND d.kind IN ('articles','statement')
      AND d.order_id=$2 AND d.client_id=$3
      AND EXISTS(SELECT 1 FROM office_operations op,jsonb_each(op.files) f
       WHERE op.target_id=$2 AND (op.phase IN ('committed','done') OR (op.phase='superseded' AND op.payload->>'previousPhase' IN ('committed','done')))
       AND f.value->>'id'=d.id::text) RETURNING d.id`,[priorDocs.map(d=>d.id),o.id,o.client_id]);
    const kept=new Set(retained.map(d=>d.id)),removed=priorDocs.filter(d=>!kept.has(d.id));
    if(removed.length)await db.query("DELETE FROM documents WHERE id = ANY($1::uuid[])", [removed.map(d=>d.id)]);
    for (const d of removed) await deleteFile(d.storage_key);
  }

  // No invented "sent" date: filed_at is set only by the button (14 Sep 2026).
  // Preserve document completion and any renewal already paid. The office records
  // the actual appointment separately; never infer it from upload time.
  const raService = ((typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload) as { registeredAgent?: { choice?: string } } | null)?.registeredAgent?.choice === "SERVICE";
  const [agentRecord] = await db.query<{ra_appointment_date:unknown}>("SELECT ra_appointment_date FROM orders WHERE id=$1",[o.id]);
  const agentAppointment = agentRecord?.ra_appointment_date;
  await db.query(
    raService
      ? "UPDATE orders SET status = 'formed', formed_at = COALESCE(formed_at,now()), ra_renewal_date = COALESCE(ra_renewal_date,$2::date) WHERE id = $1"
      : "UPDATE orders SET status = 'formed', formed_at = COALESCE(formed_at,now()) WHERE id = $1",
    raService ? [o.id, agentAppointment ? addYears(agentIso(agentAppointment)!,1) : null] : [o.id],
  );

  // Persist the requested notice on one delivered document before attempting email.
  // A retry uses the same document and the company's current formation state.
  const noticeDocument = newRows[0];
  await db.query("UPDATE documents SET meta=meta || '{\"noticeKind\":\"formation\"}'::jsonb,notice_status='pending' WHERE id=$1",[noticeDocument]);
  const notified = await notifyDocument(noticeDocument);
  return c.json({ data: { ok: true, notified, documents: files.length } });
  } finally {
    // Release the replacement claim on every path — success, compensation,
    // or throw — so the next attempt is never blocked by a finished one.
    await db
      .query("UPDATE orders SET replacing_at = NULL WHERE id = $1", [o.id])
      .catch((e) => console.error("[formation] claim release failed:", e));
  }
});

// Contact-form messages, newest first. The email to the notify address is
// the primary channel; this is the durable record behind it (P51).
app.get("/admin/contact-messages", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query(
    "SELECT id, name, email, message, created_at, notice_status, notice_error, notice_sent_at FROM contact_messages ORDER BY created_at DESC LIMIT 200",
  );
  return c.json({ data: rows });
});

app.post('/admin/contact-messages/:id/resend', async c=>{
 if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
 return c.json({data:{notified:await notifyContact(c.req.param('id'))}});
});
app.post('/admin/documents/:id/resend-notice', async c=>{
 if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
 return c.json({data:{notified:await notifyDocument(c.req.param('id'))}});
});

app.get("/admin/clients", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  // ra_llcs: the LLCs for which we serve as registered agent — paid orders
  // that took our RA service. Drives the Registered Agent Clients tab; a
  // client who requested cancellation stays listed until we are replaced as
  // agent of record (the cancellation chip carries that state).
  const rows = await db.query(
    `SELECT cl.id, cl.email, cl.name, cl.created_at,
            (SELECT min(o.ra_cancellation_requested_at) FROM orders o WHERE o.client_id=cl.id AND o.paid_at IS NOT NULL AND o.payload->'registeredAgent'->>'choice'='SERVICE' AND (o.ra_ended_date IS NULL OR o.ra_ended_date > (now() AT TIME ZONE 'America/New_York')::date)) AS ra_cancellation_requested_at,
            (cl.password_hash IS NOT NULL) AS has_password,
            -- The name in parts, from the account's earliest paid order (the
            -- Clients tab shows and sorts by last name — Adam, 10 Sep 2026).
            (SELECT o.payload->'client'->>'firstName' FROM orders o WHERE o.client_id = cl.id AND o.paid_at IS NOT NULL ORDER BY o.paid_at ASC LIMIT 1) AS first_name,
            (SELECT o.payload->'client'->>'lastName' FROM orders o WHERE o.client_id = cl.id AND o.paid_at IS NOT NULL ORDER BY o.paid_at ASC LIMIT 1) AS last_name,
            (SELECT o.payload->'client'->>'suffix' FROM orders o WHERE o.client_id = cl.id AND o.paid_at IS NOT NULL ORDER BY o.paid_at ASC LIMIT 1) AS suffix,
            COUNT(d.id)::int AS document_count,
            -- The card kept for each agent company and its latest renewal (16 Sep 2026).
            (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'order_id', o.id, 'consent', o.payload->'registeredAgent'->'renewalCardConsent', 'resignation_due', o.ra_resignation_due, 'resignation_submitted', o.ra_resignation_submitted, 'llc_name', o.llc_name, 'card_status', o.card_status, 'card_last4', o.card_last4, 'card_brand', o.card_brand, 'card_note', o.card_note,
                'replaced_at', o.ra_replaced_at, 'ended_date', o.ra_ended_date,
                'renewal_date', o.ra_renewal_date, 'cancellation_requested_at', o.ra_cancellation_requested_at,
                'balances', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'id',r.id,'purpose',r.purpose,
                  'status',r.status,'amount_cents',r.amount_cents,'date',r.renewal_date,'charged_at',r.charged_at,'link_url',r.link_url,
                  'reconcilingPayment',r.status NOT IN ('charged','paid_by_link','cancelled') AND EXISTS(SELECT 1 FROM ra_payment_attempts a WHERE a.target_id=r.id AND a.status IN ('pending','approved','completed')),
                  'notice_error',COALESCE(r.correspondence->>'error',r.notice_error)
                ) ORDER BY r.renewal_date DESC),'[]'::jsonb) FROM ra_renewals r WHERE r.order_id=o.id),
                'billing_hold', (SELECT r.billing_hold FROM ra_renewals r WHERE r.order_id=o.id ORDER BY r.renewal_date DESC LIMIT 1),
                'notice_error', (SELECT r.notice_error FROM ra_renewals r WHERE r.order_id=o.id ORDER BY r.renewal_date DESC LIMIT 1),
                'purpose', (SELECT r.purpose FROM ra_renewals r WHERE r.order_id=o.id ORDER BY r.renewal_date DESC LIMIT 1),
                'last_status', (SELECT r.status FROM ra_renewals r WHERE r.order_id = o.id ORDER BY r.renewal_date DESC LIMIT 1),
                'last_date', (SELECT to_char(r.renewal_date, 'FMMon FMDD, YYYY') FROM ra_renewals r WHERE r.order_id = o.id ORDER BY r.renewal_date DESC LIMIT 1)
              ) ORDER BY o.llc_name), '[]'::jsonb)
               FROM orders o
              WHERE o.client_id = cl.id AND o.paid_at IS NOT NULL AND o.status <> 'pending_payment'
                AND o.payload->'registeredAgent'->>'choice' = 'SERVICE') AS ra_cards,
            (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'llc_name', o.llc_name, 'contact_name', o.contact_name, 'has_summary', o.summary_storage_key IS NOT NULL) ORDER BY o.paid_at DESC), '[]'::jsonb)
               FROM orders o
              WHERE o.client_id = cl.id AND o.paid_at IS NOT NULL) AS companies
     FROM clients cl LEFT JOIN documents d ON d.client_id = cl.id AND d.deleted_at IS NULL
     WHERE EXISTS (SELECT 1 FROM orders paid WHERE paid.client_id=cl.id AND paid.paid_at IS NOT NULL AND paid.status <> 'pending_payment')
        OR EXISTS (SELECT 1 FROM service_orders paid WHERE paid.client_id=cl.id AND paid.paid_at IS NOT NULL AND paid.status NOT IN ('pending_payment','cancelled'))
     GROUP BY cl.id ORDER BY cl.created_at DESC`,
  );
  type Balance = { purpose: string; status: string; date: unknown; link_url: string | null; reconcilingPayment?: boolean; [key: string]: unknown };
  type AgentCard = { llc_name: string; resignation_submitted: unknown; replaced_at: unknown; ended_date: unknown; renewal_date: unknown; cancellation_requested_at: unknown; balances: Balance[]; [key: string]: unknown };
  const day = (value: unknown): string | null => value ? value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10) : null;
  const today = easternDateIso();
  const dateWords = (value: unknown, month: 'long' | 'short' = 'long'): string => new Date(day(value)! + 'T12:00:00Z').toLocaleDateString('en-US', {timeZone:'UTC',month,day:'numeric',year:'numeric'});
  for (const row of rows) {
    const cards = ((row.ra_cards as AgentCard[] | null) ?? []).map(card => ({
      ...card,
      balances: card.balances.map(balance => {
        const purpose = obligationPurpose({purpose:balance.purpose,status:balance.status,renewal_date:balance.date,
          ra_resignation_submitted:card.resignation_submitted,ra_replaced_at:card.replaced_at,ra_ended_date:card.ended_date,
          ra_cancellation_requested_at:card.cancellation_requested_at,reconcilingPayment:balance.reconcilingPayment});
        return {...balance,purpose,link_url:purpose === 'unavailable' ? null : balance.link_url};
      }),
    })).filter(card => !card.ended_date || day(card.ended_date)! > today || card.balances.some(balance =>
      ['service_fee','resignation'].includes(balance.purpose) && !['charged','paid_by_link','cancelled'].includes(balance.status)));
    row.ra_cards = cards;
    row.ra_llcs = cards.map(card => {
      if (card.replaced_at) return `${card.llc_name} (Replacement registered agent verified. Our registered-agent appointment ${day(card.replaced_at)! <= today ? 'ended' : 'ends'} on ${dateWords(card.replaced_at)}.)`;
      if (card.ended_date && day(card.ended_date)! <= today) return `${card.llc_name} (Our registered-agent appointment ended on ${dateWords(card.ended_date)}.)`;
      if (card.resignation_submitted) return `${card.llc_name} (Resignation submitted ${dateWords(card.resignation_submitted)})`;
      const facts = [card.renewal_date ? `renews ${dateWords(card.renewal_date, 'short')}` : '', card.cancellation_requested_at ? `cancellation requested ${dateWords(card.cancellation_requested_at, 'short')}` : ''].filter(Boolean);
      return card.llc_name + (facts.length ? ` (${facts.join(' — ')})` : '');
    });
  }
  return c.json({ data: rows });
});

/** The email record (Adam, 10 Sep 2026): everything sent to an address,
 *  newest first, and any one of them in full. */
app.get("/admin/emails", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const to = (c.req.query("to") ?? "").trim().toLowerCase();
  if (!to) return c.json(err("An address is required.", "INVALID_INPUT"), 400);
  const db = await getDb();
  const rows = await db.query(
    `SELECT id, to_address, subject, sent_at, ok, provider_id, error
       FROM email_log WHERE to_address = $1 ORDER BY sent_at DESC LIMIT 500`,
    [to],
  );
  return c.json({ data: rows });
});
app.get("/admin/emails/:id", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query(
    "SELECT id, to_address, subject, html, sent_at, ok, provider_id, error FROM email_log WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  return c.json({ data: rows[0] });
});

/** The Order Summary PDF (Adam, 10 Sep 2026), and its markdown for the
 *  checks. Office only. Orders placed before summaries existed have none. */
app.get("/admin/orders/:id/summary.pdf", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ summary_storage_key: string | null; llc_name: string }>(
    "SELECT summary_storage_key, llc_name FROM orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  if (!rows[0].summary_storage_key) return c.json(err("No summary — placed before summaries existed.", "NO_SUMMARY"), 404);
  const stream = await readFileStream(rows[0].summary_storage_key);
  const filename = `Order Summary - ${rows[0].llc_name}`.replace(/[^\w.-]+/g, "_");
  return new Response(stream as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
app.get("/admin/orders/:id/summary.md", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const o = await loadSummaryRow(c.req.param("id"));
  if (!o) return c.json(err("Not found", "NOT_FOUND"), 404);
  const db = await getDb();
  const rows = await db.query<{ summary_markdown: string | null }>("SELECT summary_markdown FROM orders WHERE id = $1", [o.id]);
  if (!rows[0]?.summary_markdown) return c.json(err("No summary — placed before summaries existed.", "NO_SUMMARY"), 404);
  return c.text(rows[0].summary_markdown);
});

/** The admin sees a client's portal as the client (Adam, 9 Sep 2026: "I need
 *  the ability to log into a client's portal to be able to see what they see
 *  and test a problem"). A real client session, two hours long, marked so the
 *  portal shows who is looking and offers Exit. Anything done in it happens
 *  as the client. */
app.post("/admin/clients/:id/view-as", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ id: string; email: string; name: string }>(
    "SELECT id, email, name FROM clients WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  await createSession(c, { clientId: rows[0].id, viewingAsAdmin: true, hours: 2 });
  console.log(`[admin] viewing the portal as client ${rows[0].id} <${rows[0].email}>`);
  return c.json({ data: { ok: true, name: rows[0].name, email: rows[0].email } });
});

/** Support override for the case a client can reach neither address. Both the
 *  old and the new address are notified, so a change is never silent. */
app.post("/admin/clients/:id/email", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = z
    .object({ newEmail: z.string().email("Enter a valid email address.") })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid request.", "INVALID_INPUT"), 400);
  }
  const newEmail = body.data.newEmail.toLowerCase();
  const db = await getDb();
  const rows = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const previous = rows[0].email;
  if (previous === newEmail) {
    return c.json(err("That is already the address on this account.", "INVALID_INPUT"), 400);
  }
  const taken = await db.query("SELECT id FROM clients WHERE email = $1", [newEmail]);
  if (taken.length > 0) {
    return c.json(err("That address is already in use on another account.", "EMAIL_TAKEN"), 400);
  }
  try {
    await db.query(`WITH changed AS (UPDATE clients SET email=$1,pending_email=NULL,auth_version=auth_version+1 WHERE id=$2 RETURNING id) UPDATE auth_tokens SET used_at=now() WHERE client_id IN (SELECT id FROM changed) AND used_at IS NULL`, [
      newEmail,
      c.req.param("id"),
    ]);
  } catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
    return c.json(err("That address is already in use on another account. Choose a different address.", "EMAIL_TAKEN"), 400);
  }
  const mail = emailChangedEmail(newEmail);
  await sendMail({ to: newEmail, ...mail }).catch((e) => console.error("[admin] email-changed (new) failed:", e));
  await sendMail({ to: previous, ...mail }).catch((e) => console.error("[admin] email-changed (old) failed:", e));
  return c.json({ data: { ok: true, email: newEmail } });
});

app.get("/admin/services", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  await purgeExpiredSElections().catch((e) => console.error("[purge] failed:", e));
  const requestedOrders = c.req.query("orders");
  const orderIds = requestedOrders?.split(",").filter(Boolean);
  if (orderIds && (!orderIds.length || orderIds.length > 200 || orderIds.some((id) => !z.string().uuid().safeParse(id).success))) {
    return c.json(err("Invalid company list.", "BAD_REQUEST"), 400);
  }
  const rows = await db.query(
    `SELECT so.id, so.type, so.status, so.llc_name, so.details, so.amount_cents,
            so.client_id, so.formation_order_id,
            ${SERVICE_COMPANY_SQL} AS board_order_id,
            so.created_at, so.paid_at, so.fulfilled_at,
            (so.ein_secret IS NOT NULL) AS has_secret,
            (EXISTS(SELECT 1 FROM office_operations oo WHERE oo.kind='service' AND oo.target_id=so.id) OR (so.type='s-election' AND so.details->>'documentId' IS NOT NULL)) AS completion_available,
            cl.email AS client_email, cl.name AS client_name
     FROM service_orders so JOIN clients cl ON cl.id = so.client_id
     WHERE so.paid_at IS NOT NULL AND so.status NOT IN ('pending_payment','duplicate_payment')
     ${orderIds ? `AND (${SERVICE_COMPANY_SQL})::text = ANY($1::text[])` : ""}
     ORDER BY so.created_at DESC`,
    orderIds ? [orderIds] : [],
  );
  return c.json({ data: rows });
});

app.get("/admin/services/:id", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{
    id: string; type: string; status: string; llc_name: string; details: unknown;
    amount_cents: number; ein_secret: string | null; created_at: string; paid_at: string | null;
    square_order_id: string | null; client_id: string;
  }>(
    "SELECT id, type, status, llc_name, details, amount_cents, ein_secret, created_at, paid_at, square_order_id, client_id FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const so = rows[0];
  let tin: string | null = null;
  let ssns: string[] | null = null; // s-election: one SSN per listed shareholder
  if (so.ein_secret) {
    try {
      const secret = decryptSecret(so.ein_secret);
      if (so.type === "s-election") ssns = JSON.parse(secret) as string[];
      else tin = secret;
    } catch (e) {
      console.error("[admin] EIN secret decrypt failed:", e);
    }
  }
  const companyId = await serviceCompanyId(so.id, so.client_id);
  const detail = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as { target?: string } | null;
  // A parent election says nothing about a series or another company.
  const sElectionPaid = detail?.target !== "series" && !!companyId && (await db.query<{ id: string }>(
    "SELECT id FROM service_orders WHERE client_id = $1 AND formation_order_id = $2 AND type = 's-election' AND status NOT IN ('pending_payment', 'cancelled') LIMIT 1",
    [so.client_id, companyId],
  )).length > 0;
  const completionOperation=await findOfficeOperation(db,'service',so.id);
  return c.json({
    data: {
      id: so.id,
      type: so.type,
      status: so.status,
      llc_name: so.llc_name,
      details: so.details,
      sElectionPaid,
      retirementState: completionOperation?.phase==='retiring'?'retiring':null,
      retirementOperationId: completionOperation?.phase==='retiring'?completionOperation.id:null,
      restoreReviewRequired: (completionOperation?.payload.restoreReview as {required?:boolean}|undefined)?.required===true,
      restoredAssignedEin: (completionOperation?.payload.restoreReview as {required?:boolean}|undefined)?.required===true ? String(completionOperation?.payload.assignedEin??'') : null,
      replacementInputRequired: completionOperation?.phase==='open'&&!!completionOperation.payload.corrects&&!completionOperation.files.upload,
      completionPending: !!completionOperation && completionOperation.phase!=='done',
      completionRevision: completionOperation?.id??(so.type==='s-election' && (so.details as {documentId?:string})?.documentId ? `document:${(so.details as {documentId:string}).documentId}` : null),
      completionPublished: !!completionOperation?.result.documentId || !!completionOperation?.payload.previousDocumentId || !!(so.details as {documentId?:string})?.documentId,
      completionError: completionOperation ? 'A saved completion can be resumed or explicitly corrected.' : null,
      amount_cents: so.amount_cents,
      created_at: so.created_at,
      paid_at: so.paid_at,
      square_order_id: so.square_order_id,
      tin,
      ssns,
    },
  });
});

// Correct the formation date supplied by the client. Existing encrypted
// questionnaire numbers are required; the package waits if its EIN is missing.
app.post("/admin/services/:id/s-election-formation-date", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date as YYYY-MM-DD.") })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err(body.error.issues[0]?.message ?? "Invalid date.", "INVALID_INPUT"), 400);
  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string; type: string; status: string; llc_name: string; details: unknown; ein_secret: string | null }>(
    "SELECT id, client_id, type, status, llc_name, details, ein_secret FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const so = rows[0];
  if (so.type !== "s-election") return c.json(err("Not found", "NOT_FOUND"), 404);
  const merged = ((typeof so.details === "string" ? JSON.parse(so.details) : so.details) ?? {}) as SElectionStoredDetails;

  // The client types the date from their Articles; this route is the
  // office's correction when the Articles say otherwise. Before the client's
  // details there is nothing to correct.
  if (!so.ein_secret) {
    return c.json(err("The client has not provided the S election details yet — they enter the formation date on the form.", "BAD_STATE"), 400);
  }

  let ssns: string[];
  try {
    ssns = JSON.parse(decryptSecret(so.ein_secret)) as string[];
  } catch (e) {
    console.error("[admin] s-election secret decrypt failed:", e);
    return c.json(err("Could not decrypt the shareholder details.", "DECRYPT_FAILED"), 500);
  }
  const priorDocumentId = merged.documentId;
  // The gate runs against the corrected date before anything is built. A
  // refused correction changes nothing: the client's date stays on file.
  const gate = evaluate2553Timing({ formationDate: body.data.date, effectiveDate: merged.effectiveDate || undefined, today: easternDateIso() });
  if (gate.status !== "ok") {
    return c.json(err(gate.message, `TIMING_${gate.status.toUpperCase()}`), 400);
  }
  merged.dateIncorporated = body.data.date;
  if (!merged.ein) {
    await db.query("UPDATE service_orders SET details=$1 WHERE id=$2", [JSON.stringify(merged), so.id]);
    return c.json({ data: { ok: true, awaitingEin: true, documentId: null } });
  }
  const built = await postSElectionPackage({ so: { id: so.id, client_id: so.client_id, llc_name: so.llc_name }, merged, ssns, priorDocumentId });
  if (!built.ok) return c.json(err("The package could not be built.", "GENERATION_FAILED"), 500);
  return c.json({ data: { ok: true, documentId: built.documentId, editableUntil: built.editableUntil } });
});

/** Draft S election package for admin review: instructions + cover letter +
 *  the filled official Form 2553. Generated on demand from the encrypted
 *  details; nothing is stored — Adam reviews and attaches it at fulfillment. */
app.get("/admin/services/:id/s-election-draft", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{
    id: string; client_id: string; type: string; status: string; llc_name: string;
    details: unknown; ein_secret: string | null;
  }>(
    "SELECT id, client_id, type, status, llc_name, details, ein_secret FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const so = rows[0];
  if (so.type !== "s-election" || !so.ein_secret) {
    return c.json(err("This order has no S election details yet.", "BAD_STATE"), 400);
  }
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as {
    ein: string; dateIncorporated?: string; effectiveDate: string;
    officerName: string; officerTitle: string; phone: string;
    shareholders: { name: string; address: string; percentage: number; dateAcquired: string }[];
  };
  if (!isValidEin(details.ein ?? "")) return c.json(err("The issued EIN is required before preparing the filing package.", "EIN_REQUIRED"), 400);
  if (!details.dateIncorporated) {
    return c.json(err("Enter the date the Division filed the Articles first — the form is built from it.", "FORMATION_DATE_REQUIRED"), 400);
  }
  let ssns: string[];
  try {
    ssns = JSON.parse(decryptSecret(so.ein_secret)) as string[];
  } catch (e) {
    console.error("[admin] s-election secret decrypt failed:", e);
    return c.json(err("Could not decrypt the shareholder details.", "DECRYPT_FAILED"), 500);
  }
  const companyId = await serviceCompanyId(so.id, so.client_id);
  if (!companyId) return c.json(err("Assign this service order to its company before generating the package.", "COMPANY_REQUIRED"), 400);
  const seed = await oaSeed(so.client_id, companyId);
  if (!seed) return c.json(err("The company could not be loaded.", "COMPANY_REQUIRED"), 400);
  const input: SElectionDetails = {
    llcName: so.llc_name,
    principalAddress: seed?.principalAddress ?? "",
    principalAddressParts: seed.principalAddressParts,
    ein: details.ein ?? "",
    dateIncorporated: details.dateIncorporated,
    effectiveDate: details.effectiveDate || details.dateIncorporated,
    officerName: details.officerName,
    officerTitle: details.officerTitle,
    phone: details.phone ?? "",
    shareholders: details.shareholders.map((s, i) => ({ ...s, ...unpackSsns(ssns[i]) })),
  };
  try {
    const pdf = await buildSElectionPackage(input);
    return new Response(pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="S-Election-Package-${so.llc_name.replace(/[^\w-]+/g, "_")}.pdf"`,
      },
    });
  } catch (e) {
    console.error("[admin] s-election draft failed:", e);
    return c.json(err("Draft generation failed.", "GENERATION_FAILED"), 500);
  }
});

app.post("/admin/services/:id/fulfill", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);

  // JSON (no attachment) or multipart (attachment posted to the client's
  // portal documents in the same action).
  const contentType = c.req.header("content-type") ?? "";
  let notify = true;
  let file: File | null = null;
  let titleOverride = "";
  let assignedEin = "";
  let correctionOf = "";
  let reviewRestoredOriginal=false;
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    if (form.file instanceof File && form.file.size > 0) file = form.file;
    notify = form.notify !== "false";
    if (typeof form.title === "string") titleOverride = form.title.trim();
    if (typeof form.ein === "string") assignedEin = einDigits(form.ein);
    if (typeof form.correctionOf === "string") correctionOf=form.correctionOf;
    reviewRestoredOriginal=form.reviewRestoredOriginal==='true';
  } else {
    const body = (await c.req.json().catch(() => ({}))) as { notify?: boolean };
    notify = body.notify !== false;
  }
  if (file && file.size > MAX_UPLOAD_BYTES) {
    return c.json(err("File is too large (20 MB max).", "TOO_LARGE"), 400);
  }

  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string; type: string; status: string; llc_name: string; details: unknown; formation_order_id: string | null }>(
    "SELECT id, client_id, type, status, llc_name, details, formation_order_id FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const so = rows[0];
  let priorOperation=await findOfficeOperation(db,'service',so.id);
  const publishedCorrection=so.type==='s-election' && correctionOf.startsWith('document:');
  if (so.status === "pending_payment" || (so.status === "fulfilled"&&!priorOperation&&!publishedCorrection)) {
    return c.json(err("This order is not in a fulfillable state.", "BAD_STATE"), 400);
  }
  if(correctionOf&&(!file||(!priorOperation&&!publishedCorrection)))return c.json(err("Select the corrected PDF and reload the saved completion before correcting it.","INVALID_INPUT"),400);
  if(priorOperation?.phase==='retiring'&&!correctionOf)return c.json(err('Continue the saved replacement before resuming.','DOCUMENT_DELETED'),409);
  if((priorOperation?.payload.restoreReview as {required?:boolean}|undefined)?.required&&!correctionOf)await assertRestoredOfficeAttemptLive(priorOperation!);
  if((priorOperation?.payload.restoreReview as {required?:boolean}|undefined)?.required&&!correctionOf&&(!reviewRestoredOriginal||!file))return c.json(err('Review the restored upload and attach its original PDF.','RECOVERY_REVIEW_REQUIRED'),409);
  const resuming=!file&&!!priorOperation&&!correctionOf;
  if(resuming&&priorOperation){
    assignedEin=String(priorOperation.payload.assignedEin||'');notify=Boolean(priorOperation.payload.notify);
    titleOverride=String(priorOperation.payload.titleOverride||'');
    if(priorOperation.files.upload){
      let held:typeof priorOperation|undefined;
      try{
       let original:Buffer;
       if(['committed','done'].includes(priorOperation.phase)){
        held=await claimOfficeVerification(db,priorOperation);
        const identities=officeFileIdentities(await officeRecoveryTables(db));
        const identity=identities.get(priorOperation.files.upload.key);
        if(!identity)throw new OfficeRecoveryError('Original identity is unavailable. Attach the original.','UPLOAD_REQUIRED');
        original=(await recoverOfficeFile(identity)).plain;
       }else original=await readOfficeFile(priorOperation.files.upload);
       file=new File([new Uint8Array(original)],'saved-upload.pdf',{type:'application/pdf'});
      }catch(e){if(e instanceof OfficeRecoveryError)return c.json(err(e.message,e.code),e.status);if(e instanceof OfficeConflict)return c.json(err(e.message,e.code),409);throw e;}
      finally{if(held)await releaseOfficeOperation(db,held);}
    }
    if(so.type==='series'&&!file&&(priorOperation.payload.attachmentRequired===true||priorOperation.input_hash!==officeHash({assignedEin,titleOverride,notify})))return c.json(err('The original PDF was not saved. Attach that PDF to finish this delivery.','UPLOAD_REQUIRED'),409);
  }
  // An EIN order's deliverable IS the IRS letter — and fulfillment deletes the
  // TIN, so completing without the letter would strand the client. Required.
  // Same for the S election package: fulfilling deletes the shareholder SSNs.
  if (so.type === "ein" && !file) {
    return c.json(err("Attach the EIN confirmation letter (CP 575) to fulfill an EIN order.", "LETTER_REQUIRED"), 400);
  }
  // The number is entered with the letter so the 2553 can carry it (Adam,
  // 7 Sep 2026). Checked the way the S election form checks one.
  if (so.type === "ein" && !isValidEin(assignedEin)) {
    return c.json(err("Enter the 9-digit EIN from the IRS confirmation letter.", "EIN_REQUIRED"), 400);
  }
  if (so.type === "s-election" && !file && priorOperation?.phase!=="committed" && priorOperation?.phase!=="done") {
    return c.json(err("Attach the election package PDF to fulfill an S election order.", "PACKAGE_REQUIRED"), 400);
  }
  // A certificate order's deliverable IS the state document.
  if ((so.type === "certificate-of-status" || so.type === "certified-copy") && !file) {
    return c.json(err("Attach the document from the Division to fulfill this order.", "DOCUMENT_REQUIRED"), 400);
  }
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as {
    seriesName?: string; target?: string;
  };
  const summary =
    so.type === "series"
      ? `Protected Series Designation — ${details.seriesName ?? so.llc_name}`
      : so.type === "s-election"
        ? `S Corporation Election Package — ${so.llc_name}`
        : so.type === "certificate-of-status"
          ? `Certificate of Status — ${so.llc_name}`
          : so.type === "certified-copy"
            ? `Certified Copy of the Articles — ${so.llc_name}`
            : `Federal EIN — ${details.target === "series" ? details.seriesName ?? so.llc_name : so.llc_name}`;

  let title=summary;
  if(file){
    title =
      titleOverride ||
      (so.type === "series"
        ? `Protected Series Designation — ${details.seriesName ?? so.llc_name} — ${so.llc_name}`
        : so.type === "s-election"
          ? `S Corporation Election Package (Form 2553) — ${so.llc_name}`
          : so.type === "certificate-of-status"
            ? certTitle("Certificate of Status", so.llc_name)
            : so.type === "certified-copy"
              ? certTitle("Certified Copy of the Articles", so.llc_name)
              : `EIN Confirmation Letter — ${details.target === "series" ? details.seriesName ?? so.llc_name : so.llc_name}`);

    if(!(await looksLikePdf(file)))return c.json(err(`${file.name} is not a readable PDF. The deliverable must be the actual PDF document.`,"NOT_A_PDF"),400);
  }
  const bytes=file?Buffer.from(await file.arrayBuffer()):null;
  let op:Awaited<ReturnType<typeof claimOfficeOperation>>|undefined;
  try{
    const hash=officeHash({pdf:bytes?.toString('base64'),assignedEin,titleOverride,notify});
    if(resuming&&bytes&&priorOperation?.input_hash!==hash)throw new OfficeConflict('The saved upload differs from the original. Select the original PDF and retry.','UPLOAD_REQUIRED');
    const intent={assignedEin,titleOverride,notify,title,summary,attachmentRequired:!!bytes};
    if(publishedCorrection){
      const documentId=correctionOf.slice('document:'.length);
      if(!z.string().uuid().safeParse(documentId).success)throw new OfficeConflict('Reload the current package before correcting it.','OFFICE_CONFLICT');
      // Automatically generated packages have no office completion operation.
      // Adopt the identified published revision, preserving it as history.
      await db.query(`INSERT INTO office_operations(kind,target_id,input_hash,payload,phase,result)
        SELECT 'service',id,$3,jsonb_build_object('assignedEin',details->>'ein','adoptedDocumentId',$2::text),'done',jsonb_build_object('documentId',$2::text)
        FROM service_orders WHERE id=$1 AND details->>'documentId'=$2 AND paid_at IS NOT NULL AND status NOT IN ('pending_payment','cancelled','duplicate_payment')
        ON CONFLICT(kind,target_id) DO NOTHING`,[so.id,documentId,officeHash({publishedDocument:documentId})]);
      priorOperation=await findOfficeOperation(db,'service',so.id);
      if(priorOperation?.payload.adoptedDocumentId!==documentId){
        const previous=priorOperation?.payload.corrects?(await db.query<{id:string;payload:Record<string,unknown>}>('SELECT id,payload FROM office_operations WHERE id=$1',[priorOperation.payload.corrects]))[0]:null;
        if(previous?.payload.adoptedDocumentId!==documentId)throw new OfficeConflict('The package has changed. Reload before correcting it.','OFFICE_CONFLICT');
        correctionOf=previous.id;
      }else correctionOf=priorOperation.id;
    }
    if(correctionOf){
      if(so.type==='s-election'&&!isValidEin(assignedEin))throw new OfficeConflict('Enter the EIN shown on the corrected S-election package.','EIN_REQUIRED');
      if(so.type==='ein'&&(details.target??'company')==='company'){
        const blocked=await db.query(`SELECT id FROM service_orders WHERE client_id=$1 AND formation_order_id=$2 AND type='s-election' AND status NOT IN ('pending_payment','cancelled') AND details->>'ein'=ANY($3::text[]) AND details->>'ein'<>$4 AND details->>'documentId' IS NOT NULL AND ein_secret IS NULL`,[so.client_id,so.formation_order_id,[priorOperation?.payload.assignedEin,priorOperation?.payload.previousEin,...(Array.isArray(priorOperation?.payload.previousEins)?priorOperation.payload.previousEins:[])].filter((x):x is string=>typeof x==='string'&&!!x),assignedEin]);
        if(blocked.length)throw new OfficeConflict('First replace the dependent S-election package with a corrected package and its EIN. Then retry this EIN correction.','DEPENDENT_CORRECTION_REQUIRED');
      }
      const priorDocumentId=priorOperation?.result.documentId??priorOperation?.payload.previousDocumentId;
      if(typeof priorDocumentId==='string')await registerOfficeDocumentHistory(priorDocumentId,so.client_id);
      await correctOfficeOperation(db,so.id,correctionOf,hash,intent);
      await cleanupSupersededOfficeFiles(db);
    }
    // Repair only the old false-completed series state, under its same immutable intent.
    if(so.type==='series'&&bytes&&!correctionOf)await db.query("UPDATE office_operations SET phase='open' WHERE kind='service' AND target_id=$1 AND input_hash=$2 AND phase='done' AND result->>'documentId' IS NULL AND NOT(files ? 'upload')",[so.id,hash]);
    op=await claimOfficeOperation(db,'service',so.id,resuming?null:hash,intent,so.type==='s-election',reviewRestoredOriginal);
    if(op.phase==='done'){await verifyOfficeDelivery(db,op,bytes?{slot:op.kind==='articles'?'articles':'upload',bytes}:undefined);await releaseOfficeOperation(db,op);return c.json({data:op.result});}
    title=String(op.payload.title);
    if(op.files.upload&&bytes){
      const existing=op.files.upload;
      await saveOfficeFile(db,op,'upload',bytes,{title:existing.title,kind:existing.kind,meta:existing.meta},!!existing.meta.sensitive);
    }
    if(op.phase==='open'){
      if(bytes&&so.type!=='s-election')await saveOfficeFile(db,op,'upload',bytes,{title,kind:so.type==='certificate-of-status'||so.type==='certified-copy'?so.type:so.type==='series'&&details.seriesName?'psd':'package',meta:so.type==='ein'||so.type==='s-election'?{sensitive:true,serviceOrderId:so.id}:so.type==='series'&&details.seriesName?{seriesNames:[details.seriesName]}:CERT_KINDS.includes(so.type as typeof CERT_KINDS[number])?{source:'portal',serviceOrderId:so.id}:{}},so.type==='ein'||so.type==='s-election');
      const patch:Record<string,unknown>={...(so.type==='ein'?{assignedEin:String(op.payload.assignedEin)}:{}),...(so.type==='s-election'&&op.payload.corrects?{ein:String(op.payload.assignedEin),einPending:false,einSource:'letter'}:{})};
      if(so.status==='awaiting_info'&&(so.type==='ein'||so.type==='s-election'))Object.assign(patch,{fulfilledByOverride:true,overrideAt:new Date().toISOString()});
      if(so.type==='s-election'){
        // Fence the package's existing atomic commit with this delivery lease.
        const documentId=await storeElectionPackage(db,{serviceId:so.id,clientId:so.client_id,companyId:so.formation_order_id,title,pdf:bytes!,details:{...details,...patch},ssns:[],retainQuestionnaireNumbers:false,priorDocumentId:(details as {documentId?:string}).documentId,officeOperation:{id:op.id,lease:op.lease}});
        op.result={documentId};op.phase='committed';
      }else{
        const f=op.files.upload;
        const gaps=await prepareCorrectionHistory(db,op,(await requireAdmin(c))!.tokenHash);
        if(f&&(so.type==='ein'))patch.documentId=f.id;
        const [committed]=await db.query<{result:Record<string,unknown>}>(`WITH operation AS (SELECT * FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='open' FOR UPDATE), inserted AS (
          INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta,mirror_path)
          SELECT $3::uuid,$4::uuid,$5::uuid,$6,$7,$8,'application/pdf',$9,$10::jsonb,$13 FROM operation WHERE $3::uuid IS NOT NULL
          ON CONFLICT(id) DO UPDATE SET storage_key=EXCLUDED.storage_key,size_bytes=EXCLUDED.size_bytes,title=EXCLUDED.title,meta=EXCLUDED.meta,mirror_path=EXCLUDED.mirror_path,mirrored_at=NULL
          WHERE documents.client_id=EXCLUDED.client_id AND documents.deleted_at IS NULL RETURNING id),
          updated AS (UPDATE service_orders SET details=COALESCE(details,'{}'::jsonb)||$11::jsonb WHERE id=$12 AND EXISTS(SELECT 1 FROM operation) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM inserted)) RETURNING id)
          , history AS (UPDATE office_operations h SET payload=jsonb_set(h.payload,'{historyRecovery}',coalesce(h.payload->'historyRecovery','{}'::jsonb)||g.value) FROM jsonb_each($14::jsonb) g WHERE h.id::text=g.key AND EXISTS(SELECT 1 FROM updated) RETURNING h.id)
          UPDATE office_operations SET phase='committed',result=jsonb_build_object('documentId',$3::uuid) WHERE id=$1 AND EXISTS(SELECT 1 FROM updated) RETURNING result`,[op.id,op.lease,f?.id??null,so.client_id,so.formation_order_id,f?.kind??'',title,f?.key??'',f?.size??0,JSON.stringify(f?.meta??{}),JSON.stringify(patch),so.id,f?.mirrorPath??null,JSON.stringify(gaps)]);
        if(!committed)throw new OfficeConflict('Another request resumed this work. Reload and retry.');
        op.result=committed.result;op.phase='committed';
      }
    }
    if(so.type==='s-election')await verifyOfficeElectionPackage(db,op,so.id,so.client_id,bytes);
    let rebuiltSElections=0;
    if(so.type==='ein'&&(details.target??'company')==='company')rebuiltSElections=await carryEinIntoSElections({clientId:so.client_id,companyOrderId:so.formation_order_id,llcName:so.llc_name,ein:String(op.payload.assignedEin),previousEin:op.payload.corrects?String(op.payload.previousEin||''):undefined,previousEins:op.payload.corrects&&Array.isArray(op.payload.previousEins)?op.payload.previousEins.filter((x):x is string=>typeof x==='string'):undefined,officeOperation:{id:op.id,lease:op.lease,parent:true}});
    await verifyOfficeDelivery(db,op,bytes?{slot:'upload',bytes}:undefined);
    const result={ok:true,documentId:op.result.documentId??null,rebuiltSElections};
    // Notice dispatch is attempted once per durable operation, even if the
    // response to the send or to final completion is lost. Existing failed-mail
    // review behavior is retained; this is not an automatic email retry loop.
    if(op.payload.notify){
      const [dispatch]=await db.query(`UPDATE office_operations SET notice_started_at=now() WHERE id=$1 AND lease=$2 AND lease_until>now() AND notice_started_at IS NULL RETURNING id`,[op.id,op.lease]);
      if(dispatch){const [client]=await db.query<{email:string}>('SELECT email FROM clients WHERE id=$1',[so.client_id]);if(client)await sendMail({to:client.email,...serviceFulfilledClientEmail({summary:String(op.payload.summary),portalUrl:env.PUBLIC_BASE_URL+'/portal'})}).catch(e=>console.error('[admin] fulfill email failed:',e));}
    }
    const [done]=await db.query(`WITH operation AS (SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='committed' FOR UPDATE), service AS (
      UPDATE service_orders SET status='fulfilled',fulfilled_at=COALESCE(fulfilled_at,now()),ein_secret=NULL WHERE id=$3 AND EXISTS(SELECT 1 FROM operation) RETURNING id)
      UPDATE office_operations SET phase='done',result=$4::jsonb,lease=NULL,lease_until=NULL,error=NULL WHERE id=$1 AND EXISTS(SELECT 1 FROM service) RETURNING id`,[op.id,op.lease,so.id,JSON.stringify(result)]);
    if(!done)throw new OfficeConflict('Another request resumed this work. Reload and retry.');
    return c.json({data:result});
  }catch(e){if(op)await releaseOfficeOperation(db,op,e);if(e instanceof OfficeRecoveryError)return c.json(err(e.message,e.code),e.status);if(e instanceof OfficeConflict)return c.json(err(e.message,e.code),409);throw e;}

});

/** The EIN just arrived: saved S-election answers for this company become
 *  a filing package with the issued number, and the client is told. Legacy
 *  pending packages can also be rebuilt while their encrypted numbers remain.
 *  If those numbers were purged, notify the client. Returns packages built. */
async function carryEinIntoSElections(args: { clientId: string; companyOrderId: string | null; llcName: string; ein: string; previousEin?:string; previousEins?:string[]; officeOperation?:{id:string;lease:string;parent?:boolean} }): Promise<number> {
  if (!args.companyOrderId) return 0;
  await associateLegacyServices(args.clientId);
  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string; llc_name: string; status: string; details: unknown; ein_secret: string | null; fulfilled_at: unknown }>(
    `SELECT id, client_id, llc_name, status, details, ein_secret, fulfilled_at FROM service_orders
      WHERE client_id = $1 AND type = 's-election' AND status NOT IN ('pending_payment','cancelled')
        AND formation_order_id::text = $2::text`,
    [args.clientId, args.companyOrderId],
  );
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [args.clientId]);
  const to = clients[0]?.email ?? "";
  const einDisplay = fmtEinDisplay(args.ein);
  let rebuilt = 0;
  for (const row of rows) {
    const d = ((typeof row.details === "string" ? JSON.parse(row.details) : row.details) ?? {}) as SElectionStoredDetails;
    if ((d as unknown as Record<string,unknown>).recoveryMetadataUnavailable || (d as unknown as Record<string,unknown>).recoveryHold) continue;
    const appliedFor = Boolean(d.einPending) || !d.ein;
    const correcting=d.ein!==args.ein&&[args.previousEin,...(args.previousEins??[])].some(previous=>!!previous&&d.ein===previous);
    if ((!appliedFor&&!correcting) || !d.shareholders?.length) continue; // nothing built yet, or the number was already on it
    if (!row.ein_secret) {
      if(correcting)throw new OfficeConflict('Replace the dependent S-election package with the corrected EIN, then resume this completion.','DEPENDENT_CORRECTION_REQUIRED');
      const needed = recoveryDetails(row);
      if (needed) {
        const changed = await db.query<{id: string}>(
          "UPDATE service_orders SET status='awaiting_info', details=$2 WHERE id=$1 AND ein_secret IS NULL AND status IN ('awaiting_info','in_progress') RETURNING id",
          [row.id, JSON.stringify({...needed, ein: args.ein, einPending: false, einSource: "letter"})]);
        if (changed.length) await notifyTaxpayerNumbersRequired(db, row);
      } else if (d.documentId || d.purgedAt) {
        const mail = sElectionEinArrivedLateEmail({ llcName: row.llc_name, einDisplay, portalUrl: `${env.PUBLIC_BASE_URL}/portal`, supportEmail: "support@myfloridaseriesllc.com" });
        await sendMail({ to, ...mail }).catch((e) => console.error("[admin] ein-late email failed:", e));
      }
      continue;
    }
    let ssns: string[];
    try {
      ssns = JSON.parse(decryptSecret(row.ein_secret)) as string[];
    } catch (error) {
      const editable = row.status === 'awaiting_info' || (row.status === 'in_progress' && d.einPending === true && !row.fulfilled_at) || sElectionWindow(row.fulfilled_at).open;
      let action: string;
      if (error instanceof EncryptionKeyError) {
        action = 'Contact technical support to restore encryption access, then retry this EIN completion. Do not delete the saved work.';
      } else if ((error instanceof SecretFormatError || error instanceof SyntaxError) && !d.documentDeletedAt) {
        action = editable
          ? 'Ask the client to re-enter the shareholder numbers in their S-election form in the portal, then retry this EIN completion.'
          : 'Use Correct delivered completion on this S-election to upload a reviewed package with the issued EIN, then retry this EIN completion.';
      } else {
        action = 'Contact technical support to check the saved numbers and encryption access before retrying. Do not delete the saved work.';
      }
      throw new OfficeConflict(`The saved S-election numbers for ${row.llc_name} could not be read. EIN completion remains pending and its letter is saved. ${action}`,"DEPENDENT_NUMBERS_UNREADABLE");
    }
    const firstPackage = !d.documentId;
    const merged: SElectionStoredDetails = { ...d, ein: args.ein, einPending: false, einSource: "letter" };
    const built = await postSElectionPackage({ so: { id: row.id, client_id: row.client_id, llc_name: row.llc_name }, merged, ssns, priorDocumentId: d.documentId, officeOperation:args.officeOperation });
    if (!built.ok) {
      throw new Error("The S-election package could not be completed. Retry this EIN completion.");
    }
    rebuilt++;
    const mail = sElectionEinAddedEmail({ llcName: row.llc_name, einDisplay, portalUrl: `${env.PUBLIC_BASE_URL}/portal`, ...(firstPackage ? { firstPackage: true as const, editableUntil: built.editableUntil ? stampEastern(new Date(built.editableUntil)) : '' } : { firstPackage: false as const }) });
    await sendMail({ to, ...mail }).catch((e) => console.error("[admin] ein-added email failed:", e));
  }
  return rebuilt;
}

/** Delete one certificate copy (Adam, 15 Sep 2026: "the user has the ability
 *  to delete older certificates"). Certificates only: the Articles and the
 *  designations are replaced, never removed. Gone from the client's portal
 *  the same moment. */
app.delete("/admin/documents/:id", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ id: string; kind: string; storage_key: string }>(
    "SELECT id, kind, storage_key FROM documents WHERE id = $1", [c.req.param("id")]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  if (!CERT_KINDS.includes(rows[0].kind as typeof CERT_KINDS[number])) {
    return c.json(err("Only a certificate copy can be deleted. Replace the Articles or a designation instead.", "BAD_KIND"), 400);
  }
  const deletion=await requestCertificateDeletion(rows[0].id);
  return c.json({data:{ok:true,pending:deletion.pending,message:deletion.pending?"Certificate removed from the portal. Storage cleanup is pending; retry cleanup.":"Certificate deleted."}});
});

/** Replace a wrong Articles or designation PDF in place (15 Sep 2026): the
 *  document keeps its title, kind and coverage; the client's portal serves
 *  the new file; the previous revision remains recoverable for older backups. */
app.post("/admin/documents/:id/replace", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ id: string; kind: string; storage_key: string }>(
    "SELECT id, kind, storage_key FROM documents WHERE id = $1", [c.req.param("id")]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  if (rows[0].kind !== "articles" && rows[0].kind !== "psd") {
    return c.json(err("Only the Articles or a designation can be replaced. Upload another certificate copy instead.", "BAD_KIND"), 400);
  }
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File) || file.size === 0) return c.json(err("Choose the replacement PDF.", "INVALID_INPUT"), 400);
  if (file.size > MAX_UPLOAD_BYTES) return c.json(err("The file is too large (20 MB max).", "TOO_LARGE"), 400);
  if (!(await looksLikePdf(file))) return c.json(err(`${file.name} is not a readable PDF.`, "NOT_A_PDF"), 400);
  const replaced = await replaceFilingDocument(db, {
    id: rows[0].id,
    expectedStorageKey: rows[0].storage_key,
    filename: file.name,
    bytes: Buffer.from(await file.arrayBuffer()),
    contentType: file.type || "application/pdf",
  });
  if (!replaced) return c.json(err("This document changed while the replacement was being prepared. Reload it and try again.", "DOCUMENT_CHANGED"), 409);
  return c.json({ data: { ok: true } });
});

/** Package documents still carrying no company after the backfill — hand
 *  uploads whose titles name no company. Adam opens this in his admin
 *  session to see what is left (7 Sep 2026). */
app.get("/admin/documents/unscoped", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query(
    `SELECT d.id, d.title, d.kind, d.created_at, cl.email AS client_email
       FROM documents d JOIN clients cl ON cl.id = d.client_id
      WHERE d.order_id IS NULL AND d.kind = 'package' AND d.deleted_at IS NULL ORDER BY d.created_at DESC`,
  );
  return c.json({ data: { count: rows.length, documents: rows } });
});

app.get("/admin/clients/:id/documents", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query(
    "SELECT id, kind, title, size_bytes, created_at, notice_status, notice_error, notice_sent_at, notice_recipient FROM documents WHERE deleted_at IS NULL AND client_id = $1 ORDER BY created_at DESC",
    [c.req.param("id")],
  );
  return c.json({ data: rows });
});

app.post("/admin/documents", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const form = await c.req.parseBody();
  const submissionId=typeof form.submissionId==='string'?form.submissionId:'';
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId))return c.json(err('A valid upload submission ID is required.','INVALID_INPUT'),400);
  const file = form.file;
  const clientId = typeof form.clientId === "string" ? form.clientId : "";
  const kind = form.kind === "legal_mail" ? "legal_mail" : "package";
  const title = typeof form.title === "string" ? form.title.trim() : "";
  // Legal mail always emails the client (Adam, 14 Sep 2026: "The email should
  // be sent when the item is uploaded"); a package emails when the box is ticked.
  const notify = kind === "legal_mail" || form.notify === "true";
  if (!(file instanceof File) || !clientId || !title) {
    return c.json(err("clientId, title, and file are required.", "INVALID_INPUT"), 400);
  }
  // Legal mail carries the day it was received (Adam, 14 Sep 2026): the
  // email used to say "today", which was the day of the scan.
  const receivedOn = typeof form.receivedOn === "string" ? form.receivedOn.trim() : "";
  if (kind === "legal_mail" && !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) {
    return c.json(err("Enter the date the mail was received.", "RECEIVED_ON_REQUIRED"), 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json(err("File is too large (20 MB max).", "TOO_LARGE"), 400);
  }
  // Strict, not claims-based: the portal download layer stamps ".pdf" and
  // serves application/pdf on EVERYTHING it delivers, so a text file that
  // never claimed to be a PDF still reaches the client dressed as one
  // (Codex UPLOAD-003 — the claims-based version of this check let exactly
  // that through). If it will be delivered as a PDF, it must be one.
  if (!(await looksLikePdf(file))) {
    return c.json(err(`${file.name} is not a readable PDF. Everything delivered through the portal is a PDF.`, "NOT_A_PDF"), 400);
  }
  const db = await getDb();
  const clients = await db.query<{ email: string; name: string }>("SELECT email, name FROM clients WHERE id = $1", [clientId]);
  if (clients.length === 0) return c.json(err("Client not found.", "NOT_FOUND"), 404);

  // A package belongs to one of the client's companies (Adam, 7 Sep 2026).
  // One company: filled in silently. Several: the office must say which.
  // Legal mail identifies its recipient company just like a package.
  const requestedOrderId = typeof form.orderId === "string" ? form.orderId.trim() : "";
  let orderId: string | null = null;
  {
    const companies = await db.query<{ id: string }>("SELECT id FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at DESC", [clientId]);
    if (requestedOrderId) {
      if (!companies.some((o) => o.id === requestedOrderId)) return c.json(err("That company is not on this client's account.", "INVALID_INPUT"), 400);
      orderId = requestedOrderId;
    } else if (companies.length === 1) {
      orderId = companies[0].id;
    } else {
      return c.json(err("Choose the company this document belongs to.", "COMPANY_REQUIRED"), 400);
    }
  }

  const [company]=await db.query<{llc_name:string}>('SELECT llc_name FROM orders WHERE id=$1 AND client_id=$2',[orderId,clientId]);
  if(!company||!orderId)return c.json(err('Company not found.','NOT_FOUND'),404);
  try{
    return c.json({data:await saveDocumentSubmission(db,{id:submissionId,clientId,orderId,kind,title,receivedOn:kind==='legal_mail'?receivedOn:'',notify,bytes:Buffer.from(await file.arrayBuffer()),llcName:company.llc_name})});
  }catch(error){
    if(error instanceof DocumentUploadError)return c.json(err(error.message,error.code),error.status);
    throw error;
  }
});
}
