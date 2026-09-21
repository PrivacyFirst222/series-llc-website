/** The dev env-summary contract in server/routes-ops.ts. Missing evidence is
 * not evidence of isolation. Even an explicit integration run needs a valid
 * summary; its override permits live flags, not an unreadable server.
 */
export const EXTERNAL_NAMES = ["database", "square", "blob", "resend", "dropbox", "smarty", "sunbiz"] as const;
export type EnvironmentProof = { offline: boolean; externals: Record<typeof EXTERNAL_NAMES[number], boolean> };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export async function requireEnvironmentProof(baseUrl: string, options: { allowExternal?: boolean } = {}): Promise<EnvironmentProof> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`${baseUrl}/api/dev/env-summary`, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    body = await response.json();
  } catch (e) { throw new Error(`REFUSED: environment proof unavailable from ${baseUrl}: ${String(e)}`); }
  const data = object(body) ? body.data : undefined;
  const externals = object(data) ? data.externals : undefined;
  if (!object(data) || typeof data.offline !== "boolean" || !object(externals)
    || Object.keys(externals).length !== EXTERNAL_NAMES.length
    || EXTERNAL_NAMES.some(name => typeof externals[name] !== "boolean")) {
    throw new Error(`REFUSED: environment proof is incomplete or malformed; expected offline and boolean flags for ${EXTERNAL_NAMES.join(", ")}`);
  }
  const proof = data as EnvironmentProof;
  const active = EXTERNAL_NAMES.filter(name => proof.externals[name]);
  if (options.allowExternal !== true && (proof.offline !== true || active.length > 0)) {
    throw new Error(`REFUSED: environment proof is not offline with all integrations disabled (offline=${proof.offline}; live=${active.join(", ") || "none"})`);
  }
  return proof;
}
