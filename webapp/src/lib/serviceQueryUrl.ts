/** Keep all three subscribers on the same purchase-recovery request. */
export function serviceQueryUrl(company?: string | null): string {
  const query = new URLSearchParams();
  if (company) query.set("company", company);
  const paid = new URLSearchParams(window.location.search).get("paid");
  if (paid) query.set("paid", paid);
  return `/api/portal/services${query.size ? `?${query}` : ""}`;
}
