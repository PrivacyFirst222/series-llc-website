// Source for the Vercel function. `bun run build:api` bundles this (and every
// dependency) into api/[[...route]].mjs — the deployed function is fully
// self-contained, so runtime dependency resolution can never fail.
/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any) {
  try {
    const { handle } = await import("@hono/node-server/vercel");
    const { app } = await import("./app");
    return await handle(app)(req, res);
  } catch (e: any) {
    console.error("[api boot]", e);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { message: "API failed to start.", code: "BOOT_FAILURE" } }));
  }
}
