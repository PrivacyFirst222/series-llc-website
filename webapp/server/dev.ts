// Local API runner (bun run server/dev.ts). Vite proxies /api here in dev.
import { app } from "./app";

const server = Bun.serve({ port: 3000, fetch: app.fetch });
console.log(`[api] dev server listening on http://localhost:${server.port}`);
