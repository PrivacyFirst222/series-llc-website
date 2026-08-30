// Split from app.ts on 29 Aug 2026 — one domain per file, code moved
// verbatim (the two dev test flags became shared.testHooks so they stay
// mutable across modules). Routes register inside registerAdminRoutes(app),
// which app.ts calls after creating the app — no circular imports.
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "./db";
import { env } from "./env";
import { listBackups, runDbBackup } from "./backup";
import { mirrorStatus, runFileMirror } from "./dropbox";

import { buildSElectionPackage, type SElectionDetails } from "./s-election";

import { decryptSecret } from "./crypto";

import { createSession, rateLimit, clientIp } from "./auth";

import { createHash } from "node:crypto";
import ownersManualMd from "../../docs/owners-manual.md";
import { deleteFile, putFile, readFileStream } from "./storage";
import { sendMail, newDocumentEmail, emailChangedEmail, serviceFulfilledClientEmail, llcFormedEmail } from "./email";
import { filingGroups, seriesNames } from "./filing";
import { err, testHooks, MAX_UPLOAD_BYTES, looksLikePdf, requireAdmin } from "./shared";
import { oaSeed, purgeExpiredSElections } from "./routes-portal";

/** Renders the Owner's Manual PDF from the markdown master bundled with
 *  this deployment and publishes it to the client library. Hash-gated: a
 *  deployment whose manual is unchanged publishes nothing. This is what
 *  keeps "always the latest edition" true — the nightly cron calls it, and
 *  the admin Library section has a button for right-now. */
export async function refreshOwnersManual(force = false): Promise<{ published: boolean; pages?: number; edition?: string }> {
  // The hash covers the renderer as well as the text: a layout fix that never
  // changes a word would otherwise never be published, and clients would keep
  // downloading the previous PDF.
  const { renderManualPdf, MANUAL_RENDERER_VERSION } = await import("./manual-pdf");
  const hash = createHash("sha256")
    .update(ownersManualMd)
    .update(`renderer:${MANUAL_RENDERER_VERSION}`)
    .digest("hex")
    .slice(0, 16);
  const db = await getDb();
  const rows = await db.query<{ meta: unknown }>(
    "SELECT meta FROM library_documents WHERE key = 'owners-manual'",
  );
  const meta = rows[0] ? ((typeof rows[0].meta === "string" ? JSON.parse(rows[0].meta) : rows[0].meta) as { hash?: string }) : null;
  if (!force && meta?.hash === hash) return { published: false };
  const { pdf, pages, edition } = await renderManualPdf(ownersManualMd);
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  const stored = await putFile("owners-manual.pdf", buf, "application/pdf");
  await db.query(
    `INSERT INTO library_documents (key, title, edition, storage_key, content_type, size_bytes, meta, updated_at)
     VALUES ('owners-manual', $1, $2, $3, 'application/pdf', $4, $5, now())
     ON CONFLICT (key) DO UPDATE SET title = $1, edition = $2, storage_key = $3,
       content_type = 'application/pdf', size_bytes = $4, meta = $5, updated_at = now()`,
    ["Series LLC Owner's Manual", edition, stored.storageKey, stored.sizeBytes, JSON.stringify({ hash, pages })],
  );
  return { published: true, pages, edition };
}

export function registerAdminRoutes(app: Hono) {

// The admin page's view of the same list. It cannot use /portal/library: that
// route requires a CLIENT session, and an admin-only session 401s — which
// rendered the library card as "Not yet published" while the manual was live.
app.get("/admin/library", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query("SELECT key, title, edition, size_bytes, updated_at FROM library_documents ORDER BY title");
  return c.json({ data: rows });
});

app.post("/admin/library/owners-manual/regenerate", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const r = await refreshOwnersManual(true);
  return c.json({ data: r });
});

app.post("/admin/library/:key", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const form = await c.req.parseBody();
  const file = form.file;
  const title = typeof form.title === "string" ? form.title.trim() : "";
  const edition = typeof form.edition === "string" ? form.edition.trim() : "";
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
    `INSERT INTO library_documents (key, title, edition, storage_key, content_type, size_bytes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (key) DO UPDATE SET title = $2, edition = $3, storage_key = $4, content_type = $5, size_bytes = $6, updated_at = now()`,
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
  // Optional search: name or email, case-insensitive. Truncation is never
  // silent — the response always says how many exist versus how many were
  // returned, and the search reaches everything the list cannot show.
  const qRaw = (c.req.query("q") ?? "").trim().slice(0, 100);
  const where = qRaw ? `WHERE o.llc_name ILIKE $1 OR o.contact_email ILIKE $1 OR o.contact_name ILIKE $1` : "";
  const params = qRaw ? [`%${qRaw}%`] : [];
  // Everything a card on the board shows, in one query. series_count and
  // ein_purchased are on the card because they change what "finished" means:
  // an order can look complete with a series undesignated or an EIN still owed.
  const rows = await db.query(
    `SELECT o.id, o.client_id, o.contact_name, o.contact_email, o.package, o.llc_name,
            o.status, o.service_fee_cents, o.state_fees_cents, o.total_cents,
            o.created_at, o.paid_at, o.filed_at, o.formed_at,
            COALESCE(jsonb_array_length(o.payload->'series'), 0) AS series_count,
            COALESCE((o.payload->'optionalDocuments'->>'ein')::boolean, false) AS ein_purchased,
            (o.payload->'registeredAgent'->>'choice' = 'SERVICE') AS ra_service,
            EXISTS (
              SELECT 1 FROM service_orders s
               WHERE s.formation_order_id = o.id AND s.type = 'ein'
                 AND s.status <> 'fulfilled'
            ) AS ein_outstanding
       FROM orders o
      ${where}
      ORDER BY o.created_at DESC LIMIT 200`,
    params,
  );
  const total = await db.query<{ c: string }>(
    `SELECT count(*) AS c FROM orders o ${where}`,
    params,
  );
  return c.json({ data: { orders: rows, total: Number(total[0].c), shown: rows.length } });
});

/** Sent to the Division. The only transition on the board a person performs —
 *  nothing in this system can observe a filing on sunbiz. */
app.post("/admin/orders/:id/filed", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  if (rows[0].status !== "paid") {
    return c.json(err(`An order is filed from "paid", not "${rows[0].status}".`, "BAD_STATE"), 400);
  }
  await db.query("UPDATE orders SET status = 'filed', filed_at = now() WHERE id = $1", [
    c.req.param("id"),
  ]);
  return c.json({ data: { ok: true } });
});

/** Undo — a misclick should not need a database console. */
app.post("/admin/orders/:id/unfiled", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  if (rows[0].status !== "filed") {
    return c.json(err("Only an order sitting with the State can be moved back.", "BAD_STATE"), 400);
  }
  await db.query("UPDATE orders SET status = 'paid', filed_at = NULL WHERE id = $1", [
    c.req.param("id"),
  ]);
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
          WHERE client_id = $1 AND order_id = $2 ORDER BY created_at`,
        [o.client_id, o.id],
      )
    : [];

  // Services bought against this formation — the EIN is the one that changes
  // what "done" means, and its SSNs stay in the service record, not here.
  const services = o.client_id
    ? await db.query<{ id: string; type: string; status: string; llc_name: string }>(
        `SELECT id, type, status, llc_name FROM service_orders
          WHERE formation_order_id = $1 ORDER BY created_at`,
        [o.id],
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
      // Kept because this endpoint used to return the raw row: reshaping it
      // silently dropped square_order_id, the e2e webhook was posted with an
      // undefined order id, and three payment assertions failed. A response
      // shape is a contract even when nobody wrote it down.
      squareOrderId: (o as unknown as { square_order_id: string | null }).square_order_id,
      contactName: o.contact_name,
      contactEmail: o.contact_email,
      totalCents: o.total_cents,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      filedAt: o.filed_at,
      formedAt: o.formed_at,
      groups: filingGroups(payload),
      alternateNames: ((payload as { llcName?: { alternateNames?: string[] } }).llcName?.alternateNames ?? []).filter(
        (n) => (n ?? "").trim() !== "",
      ),
      copiedFields:
        (typeof o.copied_fields === "string" ? JSON.parse(o.copied_fields) : o.copied_fields) ?? {},
      series: allSeries.map((name) => ({ name, covered: covered.has(name) })),
      documents: docs.map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        createdAt: d.created_at,
      })),
      services,
      hasArticles: docs.some((d) => d.kind === "articles"),
    },
  });
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
  const articles = form.articles;
  if (!(articles instanceof File)) {
    return c.json(err("The Articles of Organization PDF is required.", "INVALID_INPUT"), 400);
  }
  // psd[] files, each with a matching psdSeries[] entry: a JSON array of the
  // series names that file designates.
  const psdFiles = (Array.isArray(form["psd"]) ? form["psd"] : [form["psd"]]).filter(
    (f): f is File => f instanceof File,
  );
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

  const files = [articles, ...psdFiles];
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
    `UPDATE orders SET replacing_at = now()
      WHERE id = $1 AND (replacing_at IS NULL OR replacing_at < now() - interval '10 minutes')
      RETURNING id`,
    [o.id],
  );
  if (claim.length === 0) {
    return c.json(err("A replacement for this order is already being processed.", "REPLACEMENT_IN_PROGRESS"), 409);
  }
  try {

  const priorDocs = await db.query<{ id: string; storage_key: string }>(
    "SELECT id, storage_key FROM documents WHERE order_id = $1 AND kind IN ('articles', 'psd')",
    [o.id],
  );
  let formationPuts = 0;
  const stagedPut = async (name: string, data: ArrayBuffer, type: string) => {
    if (testHooks.failFormationPutAfter >= 0 && formationPuts >= testHooks.failFormationPutAfter) {
      testHooks.failFormationPutAfter = -1;
      throw new Error("dev: injected formation storage failure");
    }
    formationPuts += 1;
    return putFile(name, data, type);
  };

  // If the new package fails partway, undo whatever of it landed — rows
  // first, then blobs best-effort — so the client's portal shows exactly the
  // intact prior package, not a hybrid.
  const newRows: string[] = [];
  const newKeys: string[] = [];
  try {
    const storedArticles = await stagedPut(
      articles.name,
      await articles.arrayBuffer(),
      articles.type || "application/pdf",
    );
    newKeys.push(storedArticles.storageKey);
    const artRow = await db.query<{ id: string }>(
      `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes, meta)
       VALUES ($1, $2, 'articles', $3, $4, $5, $6, '{}'::jsonb) RETURNING id`,
      [
        o.client_id,
        o.id,
        `Articles of Organization — ${o.llc_name}`,
        storedArticles.storageKey,
        articles.type || "application/pdf",
        storedArticles.sizeBytes,
      ],
    );
    newRows.push(artRow[0].id);
    for (let i = 0; i < psdFiles.length; i += 1) {
      const f = psdFiles[i];
      const names = psdSeries[i];
      const stored = await stagedPut(f.name, await f.arrayBuffer(), f.type || "application/pdf");
      newKeys.push(stored.storageKey);
      const psdRow = await db.query<{ id: string }>(
        `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes, meta)
         VALUES ($1, $2, 'psd', $3, $4, $5, $6, $7) RETURNING id`,
        [
          o.client_id,
          o.id,
          `Protected Series Designation — ${names.join(", ")}`,
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

  // The new package is fully stored and recorded; retire the old one.
  if (priorDocs.length > 0) {
    await db.query("DELETE FROM documents WHERE id = ANY($1::uuid[])", [priorDocs.map((d) => d.id)]);
    for (const d of priorDocs) {
      await deleteFile(d.storage_key);
    }
  }

  await db.query(
    "UPDATE orders SET status = 'formed', formed_at = now(), filed_at = COALESCE(filed_at, now()) WHERE id = $1",
    [o.id],
  );

  const clients = await db.query<{ email: string; name: string }>(
    "SELECT email, name FROM clients WHERE id = $1",
    [o.client_id],
  );
  let notified = false;
  if (clients.length > 0) {
    const mail = llcFormedEmail({
      llcName: o.llc_name,
      seriesNames: required,
      portalUrl: `${env.PUBLIC_BASE_URL}/portal`,
    });
    notified = await sendMail({ to: clients[0].email, ...mail }).then(
      () => true,
      (e) => {
        console.error("[admin] formed email failed:", e);
        return false;
      },
    );
  }
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
    "SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200",
  );
  return c.json({ data: rows });
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
    `SELECT cl.id, cl.email, cl.name, cl.created_at, cl.ra_cancellation_requested_at,
            (cl.password_hash IS NOT NULL) AS has_password,
            COUNT(d.id)::int AS document_count,
            (SELECT COALESCE(jsonb_agg(DISTINCT o.llc_name), '[]'::jsonb)
               FROM orders o
              WHERE o.client_id = cl.id AND o.status <> 'pending_payment'
                AND o.payload->'registeredAgent'->>'choice' = 'SERVICE') AS ra_llcs
     FROM clients cl LEFT JOIN documents d ON d.client_id = cl.id
     GROUP BY cl.id ORDER BY cl.created_at DESC`,
  );
  return c.json({ data: rows });
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
  await db.query("UPDATE clients SET email = $1, pending_email = NULL WHERE id = $2", [
    newEmail,
    c.req.param("id"),
  ]);
  const mail = emailChangedEmail(newEmail);
  sendMail({ to: newEmail, ...mail }).catch((e) => console.error("[admin] email-changed (new) failed:", e));
  sendMail({ to: previous, ...mail }).catch((e) => console.error("[admin] email-changed (old) failed:", e));
  return c.json({ data: { ok: true, email: newEmail } });
});

app.get("/admin/services", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  await purgeExpiredSElections().catch((e) => console.error("[purge] failed:", e));
  const rows = await db.query(
    `SELECT so.id, so.type, so.status, so.llc_name, so.details, so.amount_cents,
            so.client_id, so.formation_order_id,
            so.created_at, so.paid_at, so.fulfilled_at,
            (so.ein_secret IS NOT NULL) AS has_secret,
            (so.type = 's-election' AND EXISTS (
              SELECT 1 FROM service_orders e
              WHERE e.client_id = so.client_id AND e.type = 'ein'
                AND e.status NOT IN ('fulfilled', 'cancelled')
            )) AS ein_pending,
            cl.email AS client_email, cl.name AS client_name
     FROM service_orders so JOIN clients cl ON cl.id = so.client_id
     ORDER BY so.created_at DESC`,
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
    square_order_id: string | null;
  }>(
    "SELECT id, type, status, llc_name, details, amount_cents, ein_secret, created_at, paid_at, square_order_id FROM service_orders WHERE id = $1",
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
  return c.json({
    data: {
      id: so.id,
      type: so.type,
      status: so.status,
      llc_name: so.llc_name,
      details: so.details,
      amount_cents: so.amount_cents,
      created_at: so.created_at,
      paid_at: so.paid_at,
      square_order_id: so.square_order_id,
      tin,
      ssns,
    },
  });
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
    ein: string; dateIncorporated: string; effectiveDate: string;
    officerName: string; officerTitle: string; phone: string;
    shareholders: { name: string; address: string; percentage: number; dateAcquired: string }[];
  };
  let ssns: string[];
  try {
    ssns = JSON.parse(decryptSecret(so.ein_secret)) as string[];
  } catch (e) {
    console.error("[admin] s-election secret decrypt failed:", e);
    return c.json(err("Could not decrypt the shareholder details.", "DECRYPT_FAILED"), 500);
  }
  const seed = await oaSeed(so.client_id);
  const input: SElectionDetails = {
    llcName: so.llc_name,
    principalAddress: seed?.principalAddress ?? "",
    ein: details.ein ?? "",
    dateIncorporated: details.dateIncorporated,
    effectiveDate: details.effectiveDate,
    officerName: details.officerName,
    officerTitle: details.officerTitle,
    phone: details.phone ?? "",
    shareholders: details.shareholders.map((s, i) => ({ ...s, ssn: ssns[i] ?? "" })),
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
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    if (form.file instanceof File && form.file.size > 0) file = form.file;
    notify = form.notify !== "false";
    if (typeof form.title === "string") titleOverride = form.title.trim();
  } else {
    const body = (await c.req.json().catch(() => ({}))) as { notify?: boolean };
    notify = body.notify !== false;
  }
  if (file && file.size > MAX_UPLOAD_BYTES) {
    return c.json(err("File is too large (20 MB max).", "TOO_LARGE"), 400);
  }

  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string; type: string; status: string; llc_name: string; details: unknown }>(
    "SELECT id, client_id, type, status, llc_name, details FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const so = rows[0];
  if (so.status === "pending_payment" || so.status === "fulfilled") {
    return c.json(err("This order is not in a fulfillable state.", "BAD_STATE"), 400);
  }
  // An EIN order's deliverable IS the IRS letter — and fulfillment deletes the
  // TIN, so completing without the letter would strand the client. Required.
  // Same for the S election package: fulfilling deletes the shareholder SSNs.
  if (so.type === "ein" && !file) {
    return c.json(err("Attach the EIN confirmation letter (CP 575) to fulfill an EIN order.", "LETTER_REQUIRED"), 400);
  }
  if (so.type === "s-election" && !file) {
    return c.json(err("Attach the election package PDF to fulfill an S election order.", "PACKAGE_REQUIRED"), 400);
  }
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as {
    seriesName?: string; target?: string;
  };
  const summary =
    so.type === "series"
      ? `Protected Series Designation — ${details.seriesName ?? so.llc_name}`
      : so.type === "s-election"
        ? `S Corporation Election Package — ${so.llc_name}`
        : `Federal EIN — ${details.target === "series" ? details.seriesName ?? "series" : so.llc_name}`;

  let documentId: string | null = null;
  if (file) {
    const title =
      titleOverride ||
      (so.type === "series"
        ? `Protected Series Designation — ${details.seriesName ?? so.llc_name}`
        : so.type === "s-election"
          ? `S Corporation Election Package (Form 2553) — ${so.llc_name}`
          : `EIN Confirmation Letter — ${details.target === "series" ? details.seriesName ?? so.llc_name : so.llc_name}`);
    // Every service deliverable is a PDF (CP 575, the 2553 package, a filed
    // designation) and lands directly in the client's portal — and for EIN and
    // S election orders, fulfillment deletes the retained taxpayer identifiers
    // right after this block. A non-PDF here would replace the client's
    // deliverable with junk at the same moment the data to redo it is
    // destroyed (Codex UPLOAD-002). Strict check, not claims-based.
    if (!(await looksLikePdf(file))) {
      return c.json(err(`${file.name} is not a readable PDF. The deliverable must be the actual PDF document.`, "NOT_A_PDF"), 400);
    }
    const stored = await putFile(file.name, await file.arrayBuffer(), file.type || "application/pdf");
    const doc = await db.query<{ id: string }>(
      `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
       VALUES ($1, 'package', $2, $3, $4, $5) RETURNING id`,
      [so.client_id, title, stored.storageKey, file.type || "application/pdf", stored.sizeBytes],
    );
    documentId = doc[0].id;
  }

  // The TIN is deleted the moment the order is fulfilled — this is what makes
  // the Privacy Policy's "not retained after issuance" promise true.
  await db.query(
    "UPDATE service_orders SET status = 'fulfilled', fulfilled_at = now(), ein_secret = NULL WHERE id = $1",
    [so.id],
  );

  if (notify) {
    const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [so.client_id]);
    if (clients[0]) {
      const mail = serviceFulfilledClientEmail({ summary, portalUrl: `${env.PUBLIC_BASE_URL}/portal` });
      sendMail({ to: clients[0].email, ...mail }).catch((e) =>
        console.error("[admin] fulfill email failed:", e),
      );
    }
  }
  return c.json({ data: { ok: true, documentId } });
});

app.get("/admin/clients/:id/documents", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query(
    "SELECT id, kind, title, size_bytes, created_at FROM documents WHERE client_id = $1 ORDER BY created_at DESC",
    [c.req.param("id")],
  );
  return c.json({ data: rows });
});

app.post("/admin/documents", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const form = await c.req.parseBody();
  const file = form.file;
  const clientId = typeof form.clientId === "string" ? form.clientId : "";
  const kind = form.kind === "legal_mail" ? "legal_mail" : "package";
  const title = typeof form.title === "string" ? form.title.trim() : "";
  const notify = form.notify === "true";
  if (!(file instanceof File) || !clientId || !title) {
    return c.json(err("clientId, title, and file are required.", "INVALID_INPUT"), 400);
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
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [clientId]);
  if (clients.length === 0) return c.json(err("Client not found.", "NOT_FOUND"), 404);

  const stored = await putFile(file.name, await file.arrayBuffer(), file.type || "application/pdf");
  const rows = await db.query<{ id: string }>(
    `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [clientId, kind, title, stored.storageKey, file.type || "application/pdf", stored.sizeBytes],
  );

  let notified = false;
  if (notify) {
    const mail = newDocumentEmail(`${env.PUBLIC_BASE_URL}/portal`);
    notified = await sendMail({ to: clients[0].email, ...mail }).then(
      () => true,
      (e) => {
        console.error("[admin] document alert email failed:", e);
        return false;
      },
    );
  }
  return c.json({ data: { id: rows[0].id, notified } });
});
}
