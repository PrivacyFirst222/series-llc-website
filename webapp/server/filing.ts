/**
 * What you need in front of you to file the Articles, in the order the Division
 * asks for it.
 *
 * The intake payload is a nested record built for storage; this flattens it into
 * labelled fields you copy one at a time. It lives in its own module because the
 * owner's filing panel is not the only thing that will ever need "the filing, as
 * fields" — and because a list of what the Division asks for is a fact about the
 * filing, not about a React component.
 *
 * No SSN appears here, ever. None is collected at formation: taxpayer numbers
 * exist only in service_orders.ein_secret, encrypted, for the EIN and S election
 * services, and the Articles do not ask for one.
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

const yesNo = (v: unknown) => (v ? "Yes" : "No");

const MANAGEMENT_LABEL: Record<string, string> = {
  MEMBER_MANAGED: "Member-managed",
  MANAGER_MANAGED: "Manager-managed",
};

/** Managers file as managers; an authorized representative signs and manages
 *  nothing. Conflating the two puts a stranger on the public record as a
 *  manager, so the role is printed on every line rather than inferred. */
const ROLE_LABEL: Record<string, string> = {
  MGR: "Manager",
  AR: "Authorized representative (signs only — do NOT list as a manager)",
  AMBR: "Authorized member",
};

export function filingGroups(payload: any): FilingGroup[] {
  const p = payload ?? {};
  const ra = p.registeredAgent ?? {};
  const mgmt = p.management ?? {};
  const groups: FilingGroup[] = [];

  groups.push({
    title: "Company",
    fields: [
      { key: "llcName", label: "LLC name", value: p.llcName?.finalName ?? "" },
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
      { key: "principal", label: "Principal office address", value: oneLine(p.principalOfficeAddress), block: true },
      { key: "mailing", label: "Mailing address", value: oneLine(p.mailingAddress), block: true },
    ],
  });

  groups.push({
    title: "Registered agent",
    fields: [
      {
        key: "raChoice",
        label: "Agent",
        value: ra.choice === "SERVICE" ? "Our registered agent service" : "Client's own agent",
      },
      {
        key: "raName",
        label: "Agent name",
        value: (ra.businessEntityName || ra.name || "").trim(),
      },
      { key: "raAddress", label: "Agent address", value: oneLine(ra.address), block: true },
      {
        key: "raSignature",
        label: "Acceptance signature",
        value: ra.acceptance?.electronicSignature ?? ra.acceptance?.acceptanceName ?? "",
      },
    ],
  });

  const people: any[] = mgmt.managersOrAuthorizedRepresentatives ?? [];
  groups.push({
    title: "Management",
    fields: [
      {
        key: "structure",
        label: "Management structure",
        value: MANAGEMENT_LABEL[mgmt.structure] ?? mgmt.structure ?? "",
      },
      {
        key: "mgmtStatement",
        label: "State the management structure in the Articles",
        value: yesNo(mgmt.includeManagementStatementInArticles),
      },
      ...people.map((m, i) => ({
        key: `person${i}`,
        label: ROLE_LABEL[m.role ?? "MGR"] ?? (m.role ?? "Manager"),
        value: [
          (m.fullName || m.businessEntityName || "").trim(),
          oneLine(m),
        ]
          .filter(Boolean)
          .join(" — "),
        block: true,
      })),
    ],
  });

  const series: any[] = p.series ?? [];
  groups.push({
    title: `Protected series (${series.length})`,
    fields: series.map((s, i) => ({
      key: `series${i}`,
      label: `Series ${i + 1}`,
      value: s.name ?? "",
    })),
  });

  groups.push({
    title: "Other",
    fields: [
      {
        key: "purpose",
        label: "Purpose",
        value:
          p.purpose?.purposeType === "SPECIFIC"
            ? p.purpose?.businessPurposeText ?? ""
            : "Any lawful business",
        block: true,
      },
      {
        key: "effectiveDate",
        label: "Effective date",
        value:
          p.effectiveDate?.option === "SPECIFIC"
            ? p.effectiveDate?.requestedEffectiveDate ?? ""
            : "Date of filing",
      },
      { key: "corrEmail", label: "Correspondence email", value: p.correspondence?.email ?? "" },
      { key: "corrName", label: "Correspondence name", value: p.correspondence?.name ?? "" },
      {
        key: "certStatus",
        label: "Certificate of status ordered",
        value: yesNo(p.optionalDocuments?.certificateOfStatus),
      },
      {
        key: "certifiedCopy",
        label: "Certified copy ordered",
        value: yesNo(p.optionalDocuments?.certifiedCopy),
      },
    ],
  });

  return groups.map((g) => ({ ...g, fields: g.fields.filter((f) => f.value !== "") }));
}

/** Every series this order must end up with a designation for. Used to decide
 *  whether an order can be marked formed: one PSD document may cover several
 *  series, but no series may be left uncovered. */
export function seriesNames(payload: any): string[] {
  return ((payload?.series ?? []) as any[]).map((s) => (s?.name ?? "").trim()).filter(Boolean);
}
