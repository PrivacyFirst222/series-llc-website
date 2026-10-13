// Migration 30: the one included third-series credit (Adam, 11–12 Oct 2026).
// A paying package whose formation completes with exactly two series keeps one
// credit toward the third. The credit never expires; it is reserved by a
// $0.00 add-series request and used when the office fulfills that series.
// Written to be repeatable: running it twice changes nothing.
export const INCLUDED_SERIES_MIGRATION = [
  `ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS credit_authorized_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS included_series_credits (
    order_id uuid PRIMARY KEY, service_order_id uuid UNIQUE, used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now())`,
  // Granted once per paid package. A practice (training) client never receives
  // one, and a credit that was already used is never recreated.
  `CREATE OR REPLACE FUNCTION grant_included_series_credit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      -- An order whose series list is missing or not a list never gets a credit
      -- and must never make marking it formed fail.
      IF NEW.formed_at IS NOT NULL AND NEW.paid_at IS NOT NULL AND jsonb_typeof(NEW.payload->'series')='array' THEN
        IF jsonb_array_length(NEW.payload->'series')=2
          AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.is_training) THEN
          INSERT INTO included_series_credits(order_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
        END IF;
      END IF;
      RETURN NEW;
    END $$`,
  `DROP TRIGGER IF EXISTS grant_included_series_credit ON orders`,
  `CREATE TRIGGER grant_included_series_credit AFTER UPDATE OF formed_at ON orders
    FOR EACH ROW EXECUTE FUNCTION grant_included_series_credit()`,
  // The credit is used when the office fulfills the series it was reserved for,
  // and never returns to available afterwards.
  `CREATE OR REPLACE FUNCTION use_included_series_credit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.status='fulfilled' THEN
        UPDATE included_series_credits SET used_at=COALESCE(NEW.fulfilled_at,now())
          WHERE service_order_id=NEW.id AND used_at IS NULL;
      END IF;
      RETURN NEW;
    END $$`,
  `DROP TRIGGER IF EXISTS use_included_series_credit ON service_orders`,
  `CREATE TRIGGER use_included_series_credit AFTER UPDATE OF status ON service_orders
    FOR EACH ROW EXECUTE FUNCTION use_included_series_credit()`,
  // Reserve the credit for one add-series request, all or nothing. Locking the
  // company row makes two requests for the one credit queue up. An identical
  // retry (same series) returns the request that already holds the credit; a
  // different series after that gets PRICE_CHANGED, never a $50 purchase.
  `CREATE OR REPLACE FUNCTION claim_included_series(cid uuid, company uuid, company_name text, detail jsonb)
    RETURNS TABLE(service_id uuid, created boolean) LANGUAGE plpgsql AS $$
    DECLARE parent orders; existing service_orders; chosen service_orders; credit included_series_credits;
    BEGIN
      SELECT * INTO parent FROM orders WHERE id=company AND client_id=cid AND paid_at IS NOT NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'A paid company is required'; END IF;
      SELECT s.* INTO existing FROM included_series_credits c JOIN service_orders s ON s.id=c.service_order_id
        WHERE c.order_id=company
          AND purchase_target('series',s.details,parent.llc_name)=purchase_target('series',detail,parent.llc_name);
      IF FOUND THEN service_id:=existing.id; created:=false; RETURN NEXT; RETURN; END IF;
      SELECT * INTO credit FROM included_series_credits WHERE order_id=company AND service_order_id IS NULL AND used_at IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_CHANGED'; END IF;
      SELECT * INTO chosen FROM claim_service_purchase(cid,company,'series',company_name,detail,0);
      IF chosen.status<>'pending_payment' THEN RAISE EXCEPTION 'PURCHASE_ALREADY_EXISTS'; END IF;
      UPDATE service_orders SET status='in_progress', credit_authorized_at=now(), amount_cents=0 WHERE id=chosen.id;
      UPDATE included_series_credits SET service_order_id=chosen.id WHERE order_id=company;
      service_id:=chosen.id; created:=true; RETURN NEXT;
    END $$`,
];
