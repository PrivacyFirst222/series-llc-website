/**
 * What you need in front of you to file the Articles, in the order the Division
 * asks for it.
 *
 * The baseline is the Sunbiz e-file form itself (efile.sunbiz.org, "Florida
 * Limited Liability Company Filing"), read field by field from Adam's filing
 * session on 20 August 2026. Every Sunbiz box gets exactly one field here, in
 * Sunbiz's own order, so filing is copy-copy-copy downward: names are split
 * Last/First the way Sunbiz wants them, addresses are split into their boxes,
 * and where the correct entry is nothing, the field says "leave blank" instead
 * of offering text.
 *
 * The intake payload is a nested record built for storage; this flattens it
 * into labelled fields you copy one at a time. It lives in its own module
 * because the owner's filing panel is not the only thing that will ever need
 * "the filing, as fields" — and because a list of what the Division asks for
 * is a fact about the filing, not about a React component.
 *
 * No SSN appears here, ever. None is collected at formation: taxpayer numbers
 * exist only in service_orders.ein_secret, encrypted, for the EIN and S
 * election services, and the Articles do not ask for one.
 */

export interface FilingField {
  /** Stable id — the copied/not-copied marks are stored against these. */
  key: string;
  label: string;
  value: string;
  /** Long values (addresses, purpose text) render as a block, not a line. */
  block?: boolean;
}

export interface FilingGroup {
  title: string;
  fields: FilingField[];
}

/** What this module actually reads from a stored order payload. Every field
 *  is optional because orders persist forever and predate several intake
 *  changes (the client card, name splitting, suffixes); a field that is
 *  missing renders as blank or "split manually", never as a crash. */
type PersonLike = {
  role?: string;
  firstName?: string;
  lastName?: string;
  suffix?: string;
  fullLegalName?: string;
  fullName?: string;
  name?: string;
  businessEntityName?: string;
  entityName?: string;
  memberType?: string;
  streetAddress1?: string;
  streetAddress2?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type Addr = {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

const oneLine = (a: Addr | null | undefined): string =>
  !a
    ? ""
    : [a.address1, a.address2, [a.city, a.state].filter(Boolean).join(", "), a.zip]
        .map((x) => (x ?? "").trim())
        .filter(Boolean)
        .join(", ");

/** Sunbiz's address boxes, one field each. */
const addrFields = (prefix: string, a: Addr | null | undefined): FilingField[] =>
  !a
    ? []
    : [
        { key: `${prefix}Street`, label: "Street address", value: (a.address1 ?? "").trim() },
        { key: `${prefix}Suite`, label: "Suite, Apt. #, etc.", value: (a.address2 ?? "").trim() },
        { key: `${prefix}City`, label: "City", value: (a.city ?? "").trim() },
        { key: `${prefix}State`, label: "State", value: (a.state ?? "").trim() },
        { key: `${prefix}Zip`, label: "Zip code", value: (a.zip ?? "").trim() },
      ];

/** Names are split by the client at intake (first/last fields) — never derived:
 *  only Maria Luz Dominguez Figaroa knows her surname is "Dominguez Figaroa".
 *  Orders placed before the split carry a single string; those render as one
 *  field marked for manual splitting. */
const personName = (m: PersonLike): { first: string; last: string; legacy: string } => {
  // The Division's Articles form has Title / Last name / First name and no
  // suffix box (its published instructions, read in full 25 Aug 2026, never
  // mention one). A suffix the client gave us must not be silently dropped,
  // so it travels in the last-name box: "Smith, Jr."
  const last = (m?.lastName ?? "").trim();
  const suffix = (m?.suffix ?? "").trim().replace(/^,\s*/, "");
  return {
    first: (m?.firstName ?? "").trim(),
    last: last && suffix ? `${last}, ${suffix}` : last,
    legacy: (m?.fullLegalName ?? m?.fullName ?? m?.name ?? "").trim(),
  };
};

/** PartyEntry (managers, ARs) spells its street fields streetAddress1/2;
 *  MemberEntry and the top-level addresses spell them address1/2. */
const personAddr = (m: PersonLike): Addr => ({
  address1: m?.streetAddress1 ?? m?.address1,
  address2: m?.streetAddress2 ?? m?.address2,
  city: m?.city,
  state: m?.state,
  zip: m?.zip,
});

const sameAddr = (a: Addr | null | undefined, b: Addr | null | undefined): boolean =>
  oneLine(a) !== "" && oneLine(a) === oneLine(b);


const MANAGEMENT_LABEL: Record<string, string> = {
  MEMBER_MANAGED: "Member-managed",
  MANAGER_MANAGED: "Manager-managed",
};

/** Adam's approved Other-Provisions sentences, 20 August 2026. The
 *  manager-managed sentence quotes the safe-harbor words of
 *  s. 605.0407(1)(a)1 verbatim; the member-managed parallel declares the
 *  statutory default at the client's request. */
const MGMT_PROVISION: Record<string, string> = {
  MANAGER_MANAGED:
    "Pursuant to Florida Statutes Section 605.0407, the company is or will be manager-managed.",
  MEMBER_MANAGED:
    "Pursuant to Florida Statutes Section 605.0407, the company is or will be member-managed.",
};

/** The stored-payload shape this module reads. Structural and all-optional:
 *  payloads come out of JSON.parse and span every intake version ever shipped. */
type PayloadLike = {
  filingPath?: string;
  existingLlcName?: string;
  sunbizDocumentNumber?: string;
  formationType?: string;
  llcName?: { desiredName?: string; finalName?: string; alternateNames?: string[]; exactNameOnly?: boolean };
  principalOfficeAddress?: Addr;
  mailingAddress?: Addr;
  registeredAgent?: PersonLike & {
    choice?: string;
    type?: string;
    address?: Addr;
    email?: string;
    phone?: string;
    acceptance?: {
      accepted?: boolean;
      acceptanceName?: string;
      capacity?: string;
      electronicSignature?: string;
    };
  };
  management?: {
    structure?: string;
    includeManagementStatementInArticles?: boolean;
    managersOrAuthorizedRepresentatives?: PersonLike[];
  };
  members?: { memberList?: PersonLike[] };
  purpose?: { purposeType?: string; businessPurposeText?: string };
  effectiveDate?: { option?: string; requestedEffectiveDate?: string | null };
  correspondence?: { name?: string; email?: string; phone?: string };
  optionalDocuments?: { certificateOfStatus?: boolean; certifiedCopy?: boolean };
  certifications?: {
    articlesSignedBy?: string;
    authorizedRepresentativeName?: string;
    authorizedRepresentativeTitle?: string;
    authorizedRepresentativeSignature?: string;
  };
  series?: { name?: string }[];
};

export function filingGroups(payload: unknown): FilingGroup[] {
  const p: PayloadLike = (payload ?? {}) as PayloadLike;
  const ra = p.registeredAgent ?? {};
  const mgmt = p.management ?? {};
  const cert = p.certifications ?? {};
  const membersInfo = p.members ?? {};
  const groups: FilingGroup[] = [];

  // ---- 1. Filing information (Sunbiz top section) ----
  groups.push({
    title: "Filing information",
    fields: [
      {
        key: "filingPath",
        label: "Filing",
        value: p.filingPath === "CONVERT" ? "Conversion of an existing entity" : "New Florida LLC",
      },
      ...(p.filingPath === "CONVERT"
        ? [
            { key: "existingName", label: "Existing entity name", value: p.existingLlcName ?? "" },
            { key: "sunbizDoc", label: "Existing document number", value: p.sunbizDocumentNumber ?? "" },
          ]
        : []),
      {
        key: "effectiveDate",
        label: "Effective date",
        value:
          p.effectiveDate?.option === "SPECIFIC"
            ? p.effectiveDate?.requestedEffectiveDate ?? ""
            : "Leave blank — effective on the date of filing",
      },
      { key: "filingFee", label: "Required filing fee", value: "$125.00" },
      {
        key: "certStatus",
        label: "Certificate of Status ($5.00)",
        value: p.optionalDocuments?.certificateOfStatus
          ? "Yes — tick the box (client paid for it)"
          : "No — leave unticked",
      },
      {
        key: "certifiedCopy",
        label: "Certified Copy ($30.00)",
        value: p.optionalDocuments?.certifiedCopy
          ? "Yes — tick the box (client paid for it)"
          : "No — leave unticked",
      },
    ],
  });

  // ---- 2. Company name ----
  const alternates: string[] = (p.llcName?.alternateNames ?? []).filter(
    (n: string) => (n ?? "").trim() !== "",
  );
  groups.push({
    title: "Company name",
    fields: [
      { key: "llcName", label: "Limited Liability Company Name", value: p.llcName?.finalName ?? "" },
      ...alternates.map((n: string, i: number) => ({
        key: `altName${i + 1}`,
        label: `Alternate name ${i + 1} (if the first choice is unavailable)`,
        value: n.trim(),
      })),
      ...(p.llcName?.exactNameOnly
        ? [
            {
              key: "exactNameOnly",
              label: "If the name is unavailable",
              value:
                "Client wants this EXACT name only — email the client before filing anything else",
              block: true,
            },
          ]
        : []),
    ],
  });

  // ---- 3. Principal place of business ----
  groups.push({
    title: "Principal place of business",
    fields: addrFields("principal", p.principalOfficeAddress),
  });

  // ---- 4. Mailing address ----
  groups.push({
    title: "Mailing address",
    fields: sameAddr(p.mailingAddress, p.principalOfficeAddress)
      ? [
          {
            key: "mailingSame",
            label: "Mailing address",
            value: 'Same as principal — tick "Mailing address same as principal address"',
          },
        ]
      : addrFields("mailing", p.mailingAddress),
  });

  // ---- 5. Registered agent ----
  const raIsBusiness = (ra.businessEntityName ?? "").trim() !== "";
  const raName = personName(ra);
  groups.push({
    title: "Registered agent",
    fields: [
      {
        key: "raChoice",
        label: "Agent",
        value: ra.choice === "SERVICE" ? "Our registered agent service" : "Client's own agent",
      },
      ...(raIsBusiness
        ? [
            {
              key: "raBusiness",
              label: "Business to serve as RA",
              value: (ra.businessEntityName ?? "").trim(),
            },
          ]
        : raName.last
          ? [
              { key: "raLast", label: "RA last name", value: raName.last },
              { key: "raFirst", label: "RA first name", value: raName.first },
            ]
          : [
              {
                key: "raFull",
                label: "RA full name (legacy order — split manually)",
                value: raName.legacy,
              },
            ]),
      ...addrFields("ra", ra.address),
      {
        key: "raSignature",
        label: "Registered Agent Signature (must be an individual's name)",
        value: ra.acceptance?.electronicSignature ?? ra.acceptance?.acceptanceName ?? "",
      },
    ],
  });

  // ---- 6. Other provisions (the optional 240-character box) ----
  const provisions: string[] = [];
  if (mgmt.includeManagementStatementInArticles && mgmt.structure && MGMT_PROVISION[mgmt.structure]) {
    provisions.push(MGMT_PROVISION[mgmt.structure]);
  }
  const purposeText = (p.purpose?.businessPurposeText ?? "").trim();
  if (p.purpose?.purposeType === "SPECIFIC" && purposeText) {
    provisions.push(purposeText);
  }
  groups.push({
    title: "Any Other Provisions (optional box, 240 characters)",
    fields:
      provisions.length === 0
        ? [
            {
              key: "otherProvisions",
              label: "Other provisions",
              value: "Leave blank — the client chose a general purpose and no statement",
            },
          ]
        : provisions.map((text, i) => ({
            key: `provision${i}`,
            label: i === 0 && provisions.length > 1 ? "Paste both, this first" : "Paste into the box",
            value: text,
            block: true,
          })),
  });

  // ---- 7. Correspondence ----
  groups.push({
    title: "Correspondence name and e-mail",
    fields: [
      { key: "corrName", label: "Name", value: p.correspondence?.name ?? "" },
      { key: "corrEmail", label: "E-mail address (entered twice)", value: p.correspondence?.email ?? "" },
    ],
  });

  // ---- 8. Electronic signature ----
  groups.push({
    title: "Electronic signature (member or authorized representative)",
    fields: [
      {
        key: "signedBy",
        label: "Articles signed by",
        value:
          cert.articlesSignedBy === "SERVICE"
            ? "Our service, as authorized representative"
            : "The client's authorized representative",
      },
      {
        key: "arName",
        label: "Authorized representative",
        value: [cert.authorizedRepresentativeName, cert.authorizedRepresentativeTitle]
          .map((x) => (x ?? "").trim())
          .filter(Boolean)
          .join(" — "),
      },
      {
        key: "arSignature",
        label: "Electronic Signature (type exactly)",
        value: (cert.authorizedRepresentativeSignature ?? "").trim(),
      },
    ],
  });

  // ---- 9. Persons authorized to manage (MGR / AMBR) ----
  const personFields: FilingField[] = [
    {
      key: "structure",
      label: "Management structure",
      value: (mgmt.structure ? MANAGEMENT_LABEL[mgmt.structure] : undefined) ?? mgmt.structure ?? "",
    },
  ];
  const people: PersonLike[] = mgmt.managersOrAuthorizedRepresentatives ?? [];
  let slot = 0;
  for (const m of people) {
    const role = m.role ?? "MGR";
    if (role === "AR") {
      personFields.push({
        key: `person${slot}Ar`,
        label: "Authorized representative",
        value: `${(m.fullName || m.businessEntityName || "").trim()} — signs only, do NOT list in this section`,
        block: true,
      });
      slot++;
      continue;
    }
    const entityName = (m.businessEntityName ?? "").trim();
    const isEntity = entityName !== "";
    const nm = personName(m);
    personFields.push({ key: `person${slot}Title`, label: `Person ${slot + 1} — Title`, value: role });
    if (isEntity) {
      personFields.push({
        key: `person${slot}Entity`,
        label: `Person ${slot + 1} — Entity name`,
        value: entityName,
      });
    } else if (nm.last) {
      personFields.push(
        { key: `person${slot}Last`, label: `Person ${slot + 1} — Last name`, value: nm.last },
        { key: `person${slot}First`, label: `Person ${slot + 1} — First name`, value: nm.first },
      );
    } else {
      personFields.push({
        key: `person${slot}Full`,
        label: `Person ${slot + 1} — Full name (legacy order — split manually)`,
        value: nm.legacy,
      });
    }
    personFields.push(...addrFields(`person${slot}`, personAddr(m)));
    slot++;
  }
  // Adam's policy of 21 Aug 2026 (option b): a member-managed company lists
  // its members as AMBR — keyed off the structure, so orders stored before the
  // policy list theirs too. Sunbiz's guidance: the listing is what banks and
  // workers'-comp exemptions rely on, and later changes are paper-only + $25.
  const memberList: PersonLike[] = membersInfo.memberList ?? [];
  if (mgmt.structure === "MEMBER_MANAGED") {
    for (const m of memberList) {
      const entityName = (m.entityName ?? "").trim();
      const isEntity = entityName !== "" && m.memberType === "ENTITY";
      const nm = personName(m);
      personFields.push({ key: `person${slot}Title`, label: `Person ${slot + 1} — Title`, value: "AMBR" });
      if (isEntity) {
        personFields.push({
          key: `person${slot}Entity`,
          label: `Person ${slot + 1} — Entity name`,
          value: entityName,
        });
      } else if (nm.last) {
        personFields.push(
          { key: `person${slot}Last`, label: `Person ${slot + 1} — Last name`, value: nm.last },
          { key: `person${slot}First`, label: `Person ${slot + 1} — First name`, value: nm.first },
        );
      } else {
        personFields.push({
          key: `person${slot}Full`,
          label: `Person ${slot + 1} — Full name (legacy order — split manually)`,
          value: nm.legacy,
        });
      }
      personFields.push(...addrFields(`person${slot}`, personAddr(m)));
      slot++;
    }
  }
  groups.push({ title: "Persons authorized to manage (MGR / AMBR)", fields: personFields });

  // ---- 10. The series: separate filings, not part of the Articles ----
  const series: { name?: string }[] = p.series ?? [];
  groups.push({
    title: `Protected series — filed separately after the Articles ($25 designation each) (${series.length})`,
    fields: series.map((s, i) => ({
      key: `series${i}`,
      label: `Series ${i + 1}`,
      value: s.name ?? "",
    })),
  });

  return groups
    .map((g) => ({ ...g, fields: g.fields.filter((f) => f.value !== "") }))
    .filter((g) => g.fields.length > 0);
}

/** Every series this order must end up with a designation for. Used to decide
 *  whether an order can be marked formed: one PSD document may cover several
 *  series, but no series may be left uncovered. */
export function seriesNames(payload: unknown): string[] {
  const series = ((payload as PayloadLike | null | undefined)?.series ?? []) as { name?: string }[];
  return series.map((s) => (s?.name ?? "").trim()).filter(Boolean);
}
