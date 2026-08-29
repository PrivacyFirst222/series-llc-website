// The API entry point. Every route lives in a domain module; this file
// creates the app, registers each domain, and holds the terminal handlers.
// Split from a single 3,585-line file on 29 Aug 2026 — same code, four rooms.
import { Hono } from "hono";
import { err } from "./shared";
import { registerPaymentRoutes } from "./routes-payments";
import { registerPortalRoutes } from "./routes-portal";
import { registerAdminRoutes } from "./routes-admin";
import { registerOpsRoutes } from "./routes-ops";

export const app = new Hono().basePath("/api");

registerPaymentRoutes(app);
registerPortalRoutes(app);
registerAdminRoutes(app);
registerOpsRoutes(app);

app.notFound((c) => c.json(err("Not found", "NOT_FOUND"), 404));
app.onError((e, c) => {
  console.error("[api]", e);
  return c.json(err("Something went wrong on our end.", "INTERNAL"), 500);
});

// The e2e suite imports these from "./app"; they live in the portal module.
export { personLegalName, effectiveOwners } from "./routes-portal";
