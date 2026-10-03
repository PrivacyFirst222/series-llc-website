// Migration 23. Migration 22 remains immutable for already-upgraded databases.
// Compare identifiers, never rewrite the client's stored/displayed series name.
export const SERIES_IDENTITY_MIGRATION = [
  `CREATE OR REPLACE FUNCTION purchase_series_key(value text, company_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE identifier text := purchase_name(value); owner_name text := purchase_name(company_name); suffix text;
    BEGIN
      -- Match the literal owning company, not a LIKE pattern or another company's prefix.
      -- Formation records can contain either a suffix or the full name with comma/dash.
      IF owner_name<>'' AND left(identifier,length(owner_name))=owner_name THEN
        suffix := substr(identifier,length(owner_name)+1);
        IF suffix ~ '^[[:space:]]*[,-]' THEN
          identifier := regexp_replace(suffix,'^[[:space:]]*[,-][[:space:]]*','');
        END IF;
      END IF;
      -- Same prefix equivalence as the formation form's seriesDedupeKey.
      RETURN purchase_name(regexp_replace(identifier,
        '(^|[^a-z0-9])(protected[[:space:]]+series|p[.]?s[.]?)(?=[^a-z0-9]|$)[[:space:]-]*',
        '\\1', 'g'));
    END $$`,
  `CREATE OR REPLACE FUNCTION purchase_target(kind text, detail jsonb, company_name text) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN kind='series' THEN purchase_series_key(detail->>'seriesName',company_name)
      WHEN kind='ein' THEN COALESCE(detail->>'target','company') || ':' ||
        CASE WHEN detail->>'target'='series' THEN purchase_series_key(detail->>'seriesName',company_name) ELSE '' END
      ELSE '' END $$`,
  `CREATE OR REPLACE FUNCTION claim_service_purchase(cid uuid, company uuid, kind text, company_name text, detail jsonb, cents int)
    RETURNS SETOF service_orders LANGUAGE plpgsql AS $$
    DECLARE chosen service_orders; owner_name text; BEGIN
      IF company IS NULL THEN RAISE EXCEPTION 'A paid company is required'; END IF;
      SELECT llc_name INTO owner_name FROM orders WHERE id=company;
      PERFORM pg_advisory_xact_lock(hashtext(company::text),hashtext(kind || ':' || purchase_target(kind,detail,owner_name)));
      IF NOT EXISTS (SELECT 1 FROM orders WHERE id=company AND client_id=cid AND status IN ('paid','filed','formed')) THEN
        RAISE EXCEPTION 'A paid company is required'; END IF;
      IF (kind='ein' AND COALESCE(detail->>'target','company')='company' AND EXISTS
        (SELECT 1 FROM orders WHERE id=company AND payload #>> '{optionalDocuments,ein}'='true')) OR
        (kind='s-election' AND EXISTS (SELECT 1 FROM orders WHERE id=company AND payload #>> '{optionalDocuments,sElection}'='true')) THEN
        RAISE EXCEPTION 'PURCHASE_ALREADY_EXISTS'; END IF;
      IF kind='series' AND EXISTS (SELECT 1 FROM orders o, jsonb_array_elements(COALESCE(o.payload->'series','[]'::jsonb)) s
          WHERE o.id=company AND purchase_series_key(s->>'name',o.llc_name)=purchase_series_key(detail->>'seriesName',o.llc_name)) THEN
        RAISE EXCEPTION 'PURCHASE_ALREADY_EXISTS'; END IF;
      SELECT * INTO chosen FROM service_orders s WHERE s.client_id=cid AND s.formation_order_id=company AND s.type=kind
        AND purchase_target(s.type,s.details,owner_name)=purchase_target(kind,detail,owner_name)
        AND s.status NOT IN ('cancelled','duplicate_payment')
        AND NOT (kind IN ('certificate-of-status','certified-copy') AND s.status='fulfilled')
        ORDER BY (s.status<>'pending_payment') DESC, s.created_at, s.id LIMIT 1;
      IF FOUND THEN RETURN NEXT chosen; RETURN; END IF;
      INSERT INTO service_orders(client_id,formation_order_id,type,llc_name,details,amount_cents)
        VALUES(cid,company,kind,company_name,detail,cents) RETURNING * INTO chosen;
      RETURN NEXT chosen;
    END $$`,
  `CREATE OR REPLACE FUNCTION record_service_payment(sid uuid, pid text, next_status text)
    RETURNS SETOF service_orders LANGUAGE plpgsql AS $$
    DECLARE target service_orders; prior service_orders; dupe boolean; recorded text; owner_name text; BEGIN
      SELECT * INTO target FROM service_orders WHERE id=sid;
      IF NOT FOUND THEN RETURN; END IF;
      SELECT llc_name INTO owner_name FROM orders WHERE id=target.formation_order_id;
      PERFORM pg_advisory_xact_lock(hashtext(COALESCE(target.formation_order_id::text,target.client_id::text)),
        hashtext(target.type || ':' || purchase_target(target.type,target.details,owner_name)));
      SELECT * INTO target FROM service_orders WHERE id=sid FOR UPDATE;
      SELECT disposition INTO recorded FROM checkout_payment_receipts WHERE payment_id=pid;
      IF FOUND THEN RETURN; END IF;
      IF target.square_payment_id=pid AND target.paid_at IS NOT NULL THEN RETURN; END IF;
      SELECT * INTO prior FROM service_orders s WHERE s.id<>sid AND s.formation_order_id=target.formation_order_id
        AND s.type=target.type AND purchase_target(s.type,s.details,owner_name)=purchase_target(target.type,target.details,owner_name)
        AND s.paid_at IS NOT NULL AND s.status NOT IN ('cancelled','duplicate_payment')
        AND (target.type NOT IN ('certificate-of-status','certified-copy') OR s.fulfilled_at IS NULL OR s.fulfilled_at>=target.created_at)
        ORDER BY s.paid_at,s.id LIMIT 1;
      dupe := FOUND OR target.paid_at IS NOT NULL;
      IF target.type='series' AND EXISTS (SELECT 1 FROM orders o, jsonb_array_elements(COALESCE(o.payload->'series','[]'::jsonb)) s
          WHERE o.id=target.formation_order_id AND purchase_series_key(s->>'name',o.llc_name)=purchase_series_key(target.details->>'seriesName',o.llc_name)) THEN dupe:=true; END IF;
      INSERT INTO checkout_payment_receipts(payment_id,service_order_id,disposition,amount_cents)
        VALUES(pid,sid,CASE WHEN dupe THEN 'refund_required' ELSE 'applied' END,target.amount_cents) ON CONFLICT DO NOTHING;
      IF dupe THEN
        UPDATE service_orders SET status=CASE WHEN paid_at IS NULL THEN 'duplicate_payment' ELSE status END,
          paid_at=COALESCE(paid_at,now()), square_payment_id=COALESCE(square_payment_id,pid),
          payment_review_reason='Duplicate payment received. Review the payment in Square and refund the extra payment.' WHERE id=sid;
        INSERT INTO payment_alerts(alert_key,message) VALUES('duplicate:'||pid,
          'Duplicate payment requires a refund review. Square payment: '||pid||'. Service order: '||sid::text||'. No duplicate work was started.')
          ON CONFLICT(alert_key) DO NOTHING;
        RETURN;
      END IF;
      RETURN QUERY UPDATE service_orders SET status=next_status,paid_at=now(),square_payment_id=pid
        WHERE id=sid AND status='pending_payment' RETURNING *;
    END $$`,
];
