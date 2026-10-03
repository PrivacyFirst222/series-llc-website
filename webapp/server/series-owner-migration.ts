// Migration 24. Do not alter migrations 22/23 or any stored legal/payment names.
export const SERIES_OWNER_MIGRATION = [
  `CREATE OR REPLACE FUNCTION purchase_series_identifier(value text, company_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE identifier text := purchase_name(value);
      owner_key text := regexp_replace(purchase_name(company_name),'[^[:alnum:]]','','g');
      prefix_key text := ''; ch text; suffix text; i integer;
    BEGIN
      -- Ignore punctuation only while matching this company's complete prefix.
      -- Never strip arbitrary company words, articles, or punctuation from the
      -- series identifier (A, AN, A-B, A B, 001 and 1 remain distinct).
      IF owner_key<>'' THEN
        FOR i IN 1..length(identifier) LOOP
          ch := substr(identifier,i,1);
          IF ch ~ '[[:alnum:]]' THEN prefix_key := prefix_key || ch; END IF;
          IF left(owner_key,length(prefix_key))<>prefix_key THEN EXIT; END IF;
          IF prefix_key=owner_key THEN
            suffix := substr(identifier,i+1);
            -- Require a word boundary: Acme LLCX is not Acme LLC.
            IF suffix ~ '^[^[:alnum:]]' THEN
              suffix := regexp_replace(suffix,'^[[:space:],.‐‑–—-]+','');
              IF suffix<>'' THEN RETURN suffix; END IF;
            END IF;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      RETURN identifier;
    END $$`,
  `CREATE OR REPLACE FUNCTION purchase_series_key(value text, company_name text) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$
    SELECT purchase_name(regexp_replace(purchase_series_identifier(value,company_name),
      '(^|[^a-z0-9])(protected[[:space:]]+series|p[.]?s[.]?)(?=[^a-z0-9]|$)[[:space:]-]*',
      '\\1', 'g')) $$`,
];
