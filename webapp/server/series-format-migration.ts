const wrappers = [["(", ")"], ["[", "]"], ["{", "}"], ["<", ">"], ["\"", "\""], ["'", "'"], ["«", "»"], ["‹", "›"], ["“", "”"], ["‘", "’"], ["「", "」"], ["『", "』"], ["【", "】"], ["〈", "〉"], ["《", "》"], ["〔", "〕"], ["`", "`"], ["（", "）"], ["［", "］"], ["｛", "｝"], ["＜", "＞"], ["〖", "〗"], ["〘", "〙"], ["〚", "〛"], ["⟨", "⟩"], ["⟪", "⟫"], ["❨", "❩"], ["❪", "❫"], ["❬", "❭"], ["❮", "❯"], ["❰", "❱"], ["❲", "❳"], ["❴", "❵"], ["⌈", "⌉"], ["⌊", "⌋"]] as const;
const openings = wrappers.map(pair => pair[0]).join('').replace(/'/g, "''");
const closings = wrappers.map(pair => pair[1]).join('').replace(/'/g, "''");

// Migration 25. Comparisons only: stored legal names and payment history stay intact.
// Formatting around the company/designation is not part of the series identifier.
// Punctuation inside an identifier is: A-B, A B, A/B and AB remain distinct.
export const SERIES_FORMAT_MIGRATION = [
  `CREATE OR REPLACE FUNCTION purchase_series_unwrap(value text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE result text := purchase_name(value);
      opens text := '${openings}';
      closes text := '${closings}';
      opening text; closing text; at integer; depth integer; i integer; wraps boolean;
    BEGIN
      LOOP
        EXIT WHEN length(result)<2;
        opening := left(result,1); at := strpos(opens,opening);
        EXIT WHEN at=0;
        closing := substr(closes,at,1);
        EXIT WHEN right(result,1)<>closing;
        -- (A) (B) is not one wrapper around A) (B.
        depth := 0; wraps := true;
        IF opening<>closing AND opening NOT IN ('‘','“','«','‹') THEN
          FOR i IN 1..length(result) LOOP
            IF substr(result,i,1)=opening THEN depth := depth+1; END IF;
            IF substr(result,i,1)=closing THEN depth := depth-1; END IF;
            IF depth=0 AND i<length(result) THEN wraps := false; EXIT; END IF;
          END LOOP;
          wraps := wraps AND depth=0;
        END IF;
        EXIT WHEN NOT wraps;
        result := btrim(substr(result,2,length(result)-2));
      END LOOP;
      RETURN result;
    END $$`,
  `CREATE OR REPLACE FUNCTION purchase_series_owner_end(value text, company_name text) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE name text := purchase_series_unwrap(value);
      owner_key text := regexp_replace(purchase_name(company_name),'[^[:alnum:]]','','g');
      prefix_key text := ''; ch text; suffix text; i integer;
    BEGIN
      IF owner_key<>'' THEN
        FOR i IN 1..length(name) LOOP
          ch := substr(name,i,1);
          IF ch ~ '[[:alnum:]]' THEN prefix_key := prefix_key || ch; END IF;
          IF left(owner_key,length(prefix_key))<>prefix_key THEN EXIT; END IF;
          IF prefix_key=owner_key THEN
            suffix := substr(name,i+1);
            IF suffix ~ '^[^[:alnum:]]' AND suffix ~ '[[:alnum:]]' THEN RETURN i; END IF;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      RETURN 0;
    END $$`,
  `CREATE OR REPLACE FUNCTION purchase_series_identifier(value text, company_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE name text := purchase_series_unwrap(value); at integer;
      opens text := '${openings}';
      closes text := '${closings}';
      wrapper integer; lead text; following text; space_at integer; close_at integer;
    BEGIN
      at := purchase_series_owner_end(value,company_name);
      IF at=0 THEN RETURN name; END IF;
      name := btrim(substr(name,at+1));
      lead := substring(name from '^[^[:alnum:]]*');
      following := substr(name,length(lead)+1);
      -- A trailing designation can follow an identifier beginning with a
      -- symbol: "Company : $A (PS)" must retain $A. Whitespace terminates
      -- the company delimiter; punctuation AFTER it belongs to that label.
      IF following !~ '^(protected[[:space:]]+series|p[.]?s[.]?)([^a-z0-9]|$)'
          AND strpos(lead,' ')>0 THEN
        space_at := length(lead)-strpos(reverse(lead),' ')+1;
        RETURN purchase_series_unwrap(substr(name,space_at+1));
      END IF;
      -- Every non-alphanumeric company-boundary delimiter, not a sample list.
      -- Keep a matched wrapper until unwrap/key processing can remove its pair.
      WHILE name<>'' AND left(name,1) !~ '[[:alnum:]]' LOOP
        wrapper := strpos(opens,left(name,1));
        IF wrapper>0 THEN
          IF purchase_series_unwrap(name)<>name THEN EXIT; END IF;
          close_at := strpos(substr(name,2),substr(closes,wrapper,1));
          IF close_at>0 AND btrim(substr(name,2,close_at-1))
              ~ '^(protected[[:space:]]+series|p[.]?s[.]?)$' THEN EXIT; END IF;
        END IF;
        name := substr(name,2);
      END LOOP;
      RETURN purchase_series_unwrap(name);
    END $$`,
  `CREATE OR REPLACE FUNCTION purchase_series_key(value text, company_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE identifier text := purchase_series_identifier(value,company_name);
      opens text := '${openings}';
      closes text := '${closings}';
      marker text := chr(1); previous text; opening text; closing text; i integer;
    BEGIN
      -- Mark designation words, so only THEIR wrappers are removed. Never
      -- erase parentheses that belong to an identifier such as A(B) or A()B.
      WHILE strpos(identifier,marker)>0 LOOP marker := marker || chr(1); END LOOP;
      identifier := regexp_replace(identifier,
        '(^|[^a-z0-9])(protected[[:space:]]+series|p[.]?s[.]?)(?=[^a-z0-9]|$)[[:space:]-]*',
        '\\1' || marker, 'g');
      LOOP
        previous := identifier;
        FOR i IN 1..length(opens) LOOP
          opening := substr(opens,i,1); closing := substr(closes,i,1);
          identifier := replace(replace(replace(replace(identifier,
            opening||marker||closing,marker),opening||' '||marker||closing,marker),
            opening||marker||' '||closing,marker),opening||' '||marker||' '||closing,marker);
        END LOOP;
        EXIT WHEN identifier=previous;
      END LOOP;
      RETURN purchase_series_unwrap(replace(identifier,marker,''));
    END $$`,
];
