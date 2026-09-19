/** Shared intake rules. Full foreign-address support is deferred by the owner. */
export function postalCodeError(zip: string | undefined, country = "United States"): string | undefined {
  const value = (zip ?? "").trim();
  if (/^(?:US|USA|United States|United States of America)$/i.test(country.trim())) {
    return /^\d{5}(?:-\d{4})?$/.test(value) ? undefined : "Enter a 5-digit ZIP code or ZIP+4.";
  }
  return value.length >= 3 ? undefined : "Enter a complete postal code.";
}
