import { assertEnglishText } from "../src/lib/englishText";

/** Protect client data BEFORE interpolation, not a regex over a finished document.
 * Entities survive Markdown structure and template-slot checks, and are decoded
 * once, only inside parsed text. Escaping ampersands prevents entity injection. */
export function encodeDocumentText(text: string): string {
  return text.replace(/\$(?=[$&`'])|[&|[\]<>*#\r\n]/g, c => `&#${c.charCodeAt(0)};`)
    .replace(/Form document/g, "&#70;orm document").replace(/v1 draft/g, "v&#49; draft");
}
export function decodeDocumentText(text: string): string {
  return text.replace(/&#(35|36|38|124|91|93|60|62|42|13|10|70|49);/g, (_, n: string) => String.fromCharCode(Number(n)));
}
export function documentInputs<T>(value: T): T {
  assertEnglishText(value);
  function encode(v: unknown): unknown {
    if (typeof v === "string") return encodeDocumentText(v);
    if (Array.isArray(v)) return v.map(encode);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, c]) => [k, encode(c)]));
    return v;
  }
  return encode(value) as T;
}
export function assertTemplateComplete(markdown: string): void {
  const templateText = markdown.replace(/\[\[(?:pagebreak|indent)\]\]/g, "").replace(/\[Reserved\.\]/g, "");
  const unfilled = templateText.match(/\[[^\]\r\n]+\]/g);
  if (unfilled || /<!--|Form document —|v1 draft/.test(templateText)) {
    throw new Error(`Document template left unfilled: ${unfilled?.join(", ") ?? "internal marker"}`);
  }
}
