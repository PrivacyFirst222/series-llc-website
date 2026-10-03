import { HTTPException } from 'hono/http-exception';
import { getDb } from './db';
import { err } from './shared';

export const normalizePurchaseName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
/** Use the same database identity as checkout claims and payment fulfillment. */
export async function seriesPurchaseIdentities(names: string[], companyName: string): Promise<{key: string; hasCompanyPrefix: boolean}[]> {
  const db = await getDb();
  return db.query(`SELECT purchase_series_key(value,$2) AS key,
    purchase_series_owner_end(value,$2)>0 AS "hasCompanyPrefix"
    FROM unnest($1::text[]) WITH ORDINALITY AS names(value,position) ORDER BY position`, [names,companyName]);
}
export async function claimServicePurchase(clientId: string, companyId: string | null, type: string, name: string, details: unknown, amount: number): Promise<string> {
  const db = await getDb();
  let rows: {id: string; status: string}[];
  try {
    rows = await db.query('SELECT * FROM claim_service_purchase($1,$2,$3,$4,$5::jsonb,$6)', [clientId,companyId,type,name,JSON.stringify(details),amount]);
  } catch (error) {
    if (!String(error).includes('PURCHASE_ALREADY_EXISTS')) throw error;
    throw new HTTPException(400, {res: Response.json(err('This purchase is already included or ordered for this company.', 'ALREADY_ORDERED'), {status:400})});
  }
  if (!rows[0] || rows[0].status !== 'pending_payment') {
    throw new HTTPException(400, {res: Response.json(err('This purchase is already on your account — see Orders in progress.', 'ALREADY_ORDERED'), {status:400})});
  }
  return rows[0].id;
}
