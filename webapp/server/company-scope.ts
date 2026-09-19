import { getDb } from "./db";

/** Repair only uniquely named legacy associations. A NULL never means every company. */
export async function associateLegacyServices(clientId: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE service_orders s SET formation_order_id = o.id
    FROM orders o WHERE s.client_id = $1 AND s.formation_order_id IS NULL
      AND o.client_id = s.client_id AND o.paid_at IS NOT NULL
      AND lower(trim(o.llc_name)) = lower(trim(s.llc_name))
      AND (SELECT count(*) FROM orders other WHERE other.client_id = s.client_id
        AND other.paid_at IS NOT NULL AND lower(trim(other.llc_name)) = lower(trim(s.llc_name))) = 1`, [clientId]);
}
export async function serviceCompanyId(serviceId: string, clientId: string): Promise<string | null> {
  await associateLegacyServices(clientId);
  const db = await getDb();
  const rows = await db.query<{ id: string }>(`SELECT o.id FROM service_orders s JOIN orders o
    ON o.id = s.formation_order_id AND o.client_id = s.client_id
    WHERE s.id = $1 AND s.client_id = $2 AND o.paid_at IS NOT NULL`, [serviceId, clientId]);
  return rows[0]?.id ?? null;
}
