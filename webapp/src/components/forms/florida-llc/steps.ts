/**
 * Single source of truth for the intake flow's order and labels.
 *
 * Steps are addressed by key rather than by numeric index so that inserting a
 * step (as the conversion path required) cannot silently repoint the review
 * page's edit links or the per-step validation.
 */
export type StepKey =
  | "path"
  | "intro"
  | "name"
  | "principal"
  | "mailing"
  | "series"
  | "agent"
  | "acceptance"
  | "management"
  | "managers"
  | "members"
  | "purpose"
  | "effective"
  | "correspondence"
  | "optional"
  | "review"
  | "certify"
  | "submit";

export const STEPS: { key: StepKey; label: string }[] = [
  { key: "path", label: "Getting started" },
  { key: "intro", label: "Eligibility" },
  { key: "name", label: "LLC name" },
  { key: "principal", label: "Principal address" },
  { key: "mailing", label: "Mailing address" },
  { key: "series", label: "Series" },
  { key: "agent", label: "Registered agent" },
  { key: "acceptance", label: "Agent acceptance" },
  { key: "management", label: "Management" },
  { key: "managers", label: "Managers / AR" },
  { key: "members", label: "Members" },
  { key: "purpose", label: "Purpose" },
  { key: "effective", label: "Effective date" },
  { key: "correspondence", label: "Correspondence" },
  { key: "optional", label: "Optional docs" },
  { key: "review", label: "Review" },
  { key: "certify", label: "Certify & sign" },
  { key: "submit", label: "Submit" },
];

export const stepIndexOf = (key: StepKey): number =>
  STEPS.findIndex((s) => s.key === key);
