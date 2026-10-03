/** Client-entered business text. Credentials are deliberately outside this policy. */
export const ENGLISH_TEXT_ERROR = "Please use English letters (A–Z). Numbers, spaces and standard punctuation are also allowed. Replace the highlighted characters to continue.";
const UNSUPPORTED = /[^\x20-\x7E\r\n\t‘’“”–—…•·§©®™£€]/u;
export function unsupportedEnglishCharacters(value: string): string[] {
  return [...new Set([...value].filter(c => UNSUPPORTED.test(c)))];
}
export function englishTextError(value: string): string | null {
  return UNSUPPORTED.test(value) ? ENGLISH_TEXT_ERROR : null;
}
/** Return field paths as well as the message so the form can identify its step. */
export function englishTextProblems(value: unknown, path = ""): Record<string, string> {
  if (typeof value === "string") return englishTextError(value) ? { [path]: ENGLISH_TEXT_ERROR } : {};
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(password|newPassword|currentPassword|confirmPassword|nameCheck|token|sourceId|verificationToken|idempotencyKey)$/i.test(key)) continue;
    Object.assign(result, englishTextProblems(child, path ? `${path}.${key}` : key));
  }
  return result;
}
/** Distinguishes a local input rejection from an unavailable server. */
export class InputValidationError extends Error {}
export function assertEnglishText(value: unknown): void {
  const errors = englishTextProblems(value);
  if (Object.keys(errors).length) throw new InputValidationError(`${ENGLISH_TEXT_ERROR} Fields: ${Object.keys(errors).join(", ")}`);
}
