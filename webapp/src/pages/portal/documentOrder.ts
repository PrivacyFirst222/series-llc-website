/** The order of "Your documents" (Adam, 7 Sep 2026): "I always want the
 *  order to be: Articles, PS Designation, EIN - if we obtained it, Operating
 *  Agreement. The rest of the documents the order doesn't matter." And
 *  (Adam, 9 Sep 2026): "If someone buys a certified copy of the Articles, it
 *  should appear just under the original Articles in the list." Within a
 *  rank, newest first. The EIN letter and the agreement are both stored as
 *  "package" documents, so they are told apart by their titles. An amendment
 *  to the agreement (12 Sep 2026) sits just under the agreement it amends. */
const isAgreement = (doc: { kind: string; title: string }) => doc.kind !== "amendment" && /Operating Agreement/i.test(doc.title);

/** `current` is the newest agreement in the list: it ranks ahead of any
 *  amendment, and the superseded agreements come after the amendments, so an
 *  amendment sits directly under the agreement it amends. */
export function documentRank(doc: { kind: string; title: string }, current?: { kind: string; title: string; created_at: string } | null): number {
  if (doc.kind === "articles") return 0;
  if (doc.kind === "certified-copy") return 1;
  if (doc.kind === "psd") return 2;
  if (/^EIN Confirmation Letter/i.test(doc.title)) return 3;
  if (isAgreement(doc)) return current && doc !== current ? 6 : 4;
  if (doc.kind === "amendment") return 5;
  return 7;
}

export function sortDocuments<T extends { kind: string; title: string; created_at: string }>(docs: T[]): T[] {
  const current = docs.filter(isAgreement).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0] ?? null;
  return [...docs].sort((a, b) => documentRank(a, current) - documentRank(b, current) || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}
