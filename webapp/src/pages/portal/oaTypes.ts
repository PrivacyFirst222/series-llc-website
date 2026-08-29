// Shared answer types for the operating-agreement questionnaire — split from
// OAQuestionnaire.tsx on 29 Aug 2026 so the section components declare their
// contracts explicitly instead of closing over one 880-line component.
import type { OwnershipMode } from "@/lib/ownership";

export interface MemberAnswer {
  // Identity travels with the owner. Kept in a parallel array keyed by
  // position, deleting an owner would slide every share onto the wrong person.
  name?: string;
  address?: string;
  percentage?: number;
  numerator?: number;
  denominator?: number;
  contribution?: string;
  todBeneficiary?: string;
}
export interface SeriesAnswer {
  purpose?: string;
  contribution?: string;

}
export interface CoupleAnswer {
  a: number;
  b: number;
  form: "TBE" | "JTWROS";
  percentage?: number;
  numerator?: number;
  denominator?: number;
  contribution?: string;
  todBeneficiary?: string;
}
export interface Answers {
  firstOrAmended?: "first" | "amended";
  sElection?: boolean;
  multiOwner?: boolean;
  effectiveDate?: string;
  authorized?: boolean;
  contributionToCompany?: string;
  members?: MemberAnswer[];
  series?: SeriesAnswer[];
  couples?: CoupleAnswer[];
  ownershipMode?: OwnershipMode;
  includeCapitalCalls?: boolean;
  capitalCallCap?: number;
  competition?: "A" | "B";
  includeShotgun?: boolean;
  borrowingThreshold?: number;
}
export type Unit =
  | { kind: "couple"; ci: number; label: string; note: string; repIndex: number }
  | { kind: "member"; index: number; label: string };
export const FORM_LABEL: Record<"TBE" | "JTWROS", string> = {
  TBE: "tenants by the entirety",
  JTWROS: "joint tenants with right of survivorship",
};
