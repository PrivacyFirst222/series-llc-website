// Vercel Node.js runtime entry — one function serves every /api/* route.
import { handle } from "@hono/node-server/vercel";
import { app } from "../server/app";

export default handle(app);
