/** The order of "Your documents" (Adam, 7 Sep 2026): "I always want the
 *  order to be: Articles, PS Designation, EIN - if we obtained it, Operating
 *  Agreement. The rest of the documents the order doesn't matter." Within a
 *  rank, newest first. The EIN letter and the agreement are both stored as
 *  "package" documents, so they are told apart by their titles. */
export function documentRank(doc: { kind: string; title: string }): number {
  if (doc.kind === "articles") return 0;
  if (doc.kind === "psd") return 1;
  if (/^EIN Confirmation Letter/i.test(doc.title)) return 2;
  if (/Operating Agreement/i.test(doc.title)) return 3;
  return 4;
}

export function sortDocuments<T extends { kind: string; title: string; created_at: string }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => documentRank(a) - documentRank(b) || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}
