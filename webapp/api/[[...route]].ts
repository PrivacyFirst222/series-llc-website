// Vercel Node.js runtime entry — one function serves every /api/* route.
// Imports are dynamic so a module-load failure surfaces as a response
// instead of an opaque FUNCTION_INVOCATION_FAILED.
/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any) {
  try {
    const { handle } = await import("@hono/node-server/vercel");
    const { app } = await import("../server/app");
    return await handle(app)(req, res);
  } catch (e: any) {
    console.error("[api boot]", e);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: { message: String(e?.stack ?? e).slice(0, 2000), code: "BOOT_FAILURE" },
      }),
    );
  }
}
