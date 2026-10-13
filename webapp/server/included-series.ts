import { HTTPException } from "hono/http-exception";
import { getDb } from "./db";
import { err } from "./shared";

/** True while the company holds an unreserved, unused included third series. */
export async function creditAvailable(clientId: string, companyId: string | null): Promise<boolean> {
  if (!companyId) return false;
  const db = await getDb();
  const rows = await db.query(`SELECT 1 FROM included_series_credits c JOIN orders o ON o.id=c.order_id
    WHERE o.id=$1 AND o.client_id=$2 AND c.service_order_id IS NULL AND c.used_at IS NULL`, [companyId, clientId]);
  return rows.length > 0;
}

/** Reserves the credit for one series request (see claim_included_series in
 *  migration 30). "created" is true only for the call that made the request,
 *  so the office is told once. "PRICE_CHANGED" when another request holds it. */
export async function claimIncludedSeries(clientId: string, companyId: string, companyName: string,
  detail: Record<string, unknown>): Promise<{ id: string; created: boolean } | "PRICE_CHANGED"> {
  const db = await getDb();
  try {
    const [row] = await db.query<{ service_id: string; created: boolean }>(
      "SELECT service_id, created FROM claim_included_series($1,$2,$3,$4::jsonb)",
      [clientId, companyId, companyName, JSON.stringify(detail)]);
    return { id: row.service_id, created: row.created };
  } catch (e) {
    if (String(e).includes("PRICE_CHANGED")) return "PRICE_CHANGED";
    if (String(e).includes("PURCHASE_ALREADY_EXISTS")) {
      throw new HTTPException(400, { res: Response.json(err("This purchase is already included or ordered for this company.", "ALREADY_ORDERED"), { status: 400 }) });
    }
    throw e;
  }
}
