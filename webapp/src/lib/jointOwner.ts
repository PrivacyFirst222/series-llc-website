/** Jointly held interests on Form 2553 (Adam, 6 Sep 2026: "when a couple owns
 *  shares jointly as TBE or JTWROS, the 2553 is completed as shown").
 *
 *  IRS Instructions for Form 2553 (12/2020), column K: "Each tenant in
 *  common, joint tenant, and tenant by the entirety must consent." Column M:
 *  "Enter the social security number of each individual listed in column J."
 *
 *  One row on the form: both names in column J with the joint kind, one
 *  address, one combined percentage and date acquired, both Social Security
 *  numbers in column M, and both co-owners sign column K by hand. */
export type JointKind = "" | "tbe" | "jtwros";

export const JOINT_KINDS: { value: JointKind; label: string; suffix: string }[] = [
  { value: "", label: "Owned individually", suffix: "" },
  { value: "tbe", label: "Jointly with spouse — tenants by the entirety", suffix: "as Tenants by the Entirety" },
  { value: "jtwros", label: "Jointly — joint tenants with right of survivorship", suffix: "as Joint Tenants with Right of Survivorship" },
];

export const isJoint = (joint: JointKind | undefined): joint is "tbe" | "jtwros" => joint === "tbe" || joint === "jtwros";

/** Column J's name line: "John A. Smith and Jane B. Smith as Tenants by the Entirety". */
export function jointDisplayName(name: string, name2: string | undefined, joint: JointKind | undefined): string {
  if (!isJoint(joint)) return name;
  const suffix = JOINT_KINDS.find((k) => k.value === joint)?.suffix ?? "";
  return `${name} and ${name2 ?? ""} ${suffix}`.replace(/\s+/g, " ").trim();
}

/** Column J: the name line over the address — or, when co-owners live apart
 *  (Adam, 7 Sep 2026: "Joint owners may not share the same address"), each
 *  co-owner's address on its own line under their name, as the IRS asks for
 *  "the name and address of each shareholder". */
export function columnJText(sh: { name: string; address: string; joint?: JointKind; name2?: string; address2?: string }): string {
  const names = jointDisplayName(sh.name, sh.name2, sh.joint);
  const second = (sh.address2 ?? "").trim();
  if (isJoint(sh.joint) && second && second !== sh.address.trim()) {
    return `${names}\n${sh.name}: ${sh.address}\n${sh.name2 ?? ""}: ${second}`;
  }
  return `${names}\n${sh.address}`;
}

const fmtSsn = (ssn: string, recordCopy: boolean): string =>
  recordCopy ? `XXX-XX-${ssn.slice(-4)}` : `${ssn.slice(0, 3)}-${ssn.slice(3, 5)}-${ssn.slice(5)}`;

/** Column M: one number, or both stacked as on Adam's sample — the first
 *  with a trailing slash over the second (the cell is too narrow for both on
 *  one line): "123-45-6789 /" newline "987-65-4321". */
export function ssnColumnText(ssn: string, ssn2: string | undefined, joint: JointKind | undefined, recordCopy = false): string {
  const first = fmtSsn(ssn, recordCopy);
  if (!isJoint(joint) || !ssn2) return first;
  return `${first} /\n${fmtSsn(ssn2, recordCopy)}`;
}

/** The encrypted store keeps one string per row: "aaaaaaaaa" or "aaaaaaaaa|bbbbbbbbb". */
export const packSsns = (ssn: string, ssn2: string | undefined): string => (ssn2 ? `${ssn}|${ssn2}` : ssn);
export const unpackSsns = (packed: string | undefined): { ssn: string; ssn2: string } => {
  const [ssn = "", ssn2 = ""] = (packed ?? "").split("|");
  return { ssn, ssn2 };
};
