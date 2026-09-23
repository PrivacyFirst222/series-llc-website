import type { Db } from "./db";

// Legacy purchases without an explicit company use the newest company across
// the whole account, never just the companies on the current search/page.
export const SERVICE_COMPANY_SQL = `COALESCE(so.formation_order_id,
  (SELECT newest.id FROM orders newest WHERE newest.client_id = so.client_id
   ORDER BY newest.created_at DESC, newest.id DESC LIMIT 1))`;

const BOARD_SQL = `WITH facts AS (
 SELECT o.id, o.client_id, o.contact_name, o.contact_email, o.package, o.llc_name,
        o.status, o.service_fee_cents, o.state_fees_cents, o.created_at, o.formed_at,
        COALESCE(jsonb_array_length(o.payload->'series'), 0) AS series_count,
        COALESCE((o.payload->'optionalDocuments'->>'certificateOfStatus')::boolean, false) AS cert_status_purchased,
        COALESCE((o.payload->'optionalDocuments'->>'certifiedCopy')::boolean, false) AS certified_copy_purchased,
        EXISTS (SELECT 1 FROM documents d WHERE d.order_id = o.id AND d.kind = 'certificate-of-status' AND d.deleted_at IS NULL AND COALESCE(d.meta->>'source', 'card') <> 'portal') AS cert_status_uploaded,
        EXISTS (SELECT 1 FROM documents d WHERE d.order_id = o.id AND d.kind = 'certified-copy' AND d.deleted_at IS NULL AND COALESCE(d.meta->>'source', 'card') <> 'portal') AS certified_copy_uploaded,
        (o.payload->'registeredAgent'->>'choice' = 'SERVICE') AS ra_service,
        EXISTS (SELECT 1 FROM service_orders so WHERE ${SERVICE_COMPANY_SQL} = o.id AND so.status IN ('awaiting_info', 'in_progress')) AS services_owed,
        EXISTS (SELECT 1 FROM service_orders so WHERE ${SERVICE_COMPANY_SQL} = o.id AND so.status IN ('awaiting_info', 'in_progress') AND so.created_at > o.formed_at) AS new_work
 FROM orders o
), board AS (
 SELECT *, CASE
   WHEN status = 'pending_payment' THEN 'pending'
   WHEN status = 'paid' OR (status = 'formed' AND new_work) THEN 'new'
   WHEN status = 'filed' THEN 'state'
   WHEN status = 'formed' AND (services_owed OR (cert_status_purchased AND NOT cert_status_uploaded) OR (certified_copy_purchased AND NOT certified_copy_uploaded)) THEN 'post-filing'
   WHEN status = 'formed' THEN 'completed'
   ELSE 'other' END AS work_stage
 FROM facts
)`;

export async function readOrderBoard(db: Db, q: string, view: "all" | "active" | "completed", requestedPage: number) {
  const pageSize = view === "all" ? 200 : 50;
  const scope = view === "completed" ? "work_stage = 'completed'" : view === "active" ? "work_stage IN ('pending', 'new', 'state', 'post-filing')" : "true";
  const where = `${scope} AND ($1 = '' OR llc_name ILIKE $2 OR contact_name ILIKE $2 OR contact_email ILIKE $2)`;
  // Count and page share one database snapshot. Clamp after the last card on
  // a page is completed, so the office is not left on a nonexistent page.
  const [result] = await db.query<{ orders: Record<string, unknown>[]; total: number; page: number }>(`${BOARD_SQL},
    counted AS (SELECT count(*)::integer AS total FROM board WHERE ${where}),
    paging AS (SELECT total, LEAST($3::integer, GREATEST(1, ceil(total::numeric / $4::integer)::integer)) AS page FROM counted)
    SELECT (SELECT COALESCE(json_agg(selected), '[]'::json) FROM
      (SELECT * FROM board WHERE ${where} ORDER BY created_at DESC, id DESC
       LIMIT $4 OFFSET (SELECT (page - 1) * $4 FROM paging)) selected) AS orders,
      total, page FROM paging`, [q, `%${q}%`, requestedPage, pageSize]);
  return { ...result, shown: result.orders.length, pageSize };
}
