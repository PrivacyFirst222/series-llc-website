// Source for the Vercel function. `bun run build:api` bundles this (and every
// dependency) into api/index.mjs — the deployed function is fully
// self-contained, so runtime dependency resolution can never fail.
//
// The Node req/res → fetch bridge is written out here (rather than using an
// adapter package) so its behavior is pinned and testable under plain Node.
import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "./app";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
    const host =
      (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "localhost";
    const method = req.method ?? "GET";

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else if (value != null) {
        headers.set(key, value);
      }
    }

    let body: Buffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = Buffer.concat(chunks);
    }

    const response = await app.fetch(
      new Request(`${proto}://${host}${req.url ?? "/"}`, {
        method,
        headers,
        body: body as BodyInit | undefined,
      }),
    );

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") res.setHeader(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader("set-cookie", cookies);
    if (method === "HEAD" || response.status === 204 || response.status === 304 || !response.body) {
      await response.body?.cancel();
      res.end();
    } else {
      // pipeline applies backpressure and cancels the source on disconnect.
      // Do not materialize the response: large authenticated PDFs must stream.
      await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), res);
    }
  } catch (e) {
    console.error("[api]", e);
    if (res.headersSent || res.destroyed) {
      res.destroy(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { message: "Something went wrong on our end.", code: "INTERNAL" } }));
  }
}
