import {registerOfficeUploads} from './office-uploads';
import {OfficeConflict} from './office-operation';
import {OfficeRecoveryError} from './office-recovery-sources';
import {registerOfficeRecovery} from './routes-office-recovery';
import { HTTPException } from 'hono/http-exception';
import { registerAgentCheckout } from "./ra-checkout";
import { registerAgentOffice } from "./ra-office";
// The API entry point. Every route lives in a domain module; this file
// creates the app, registers each domain, and holds the terminal handlers.
// Split from a single 3,585-line file on 29 Aug 2026 — same code, four rooms.
import { englishBusinessInput } from "./english-input";
import { Hono } from "hono";
import { err, requireAdmin } from "./shared";
import { getDb } from "./db";
import { registerPaymentRoutes } from "./routes-payments";
import { registerPortalRoutes } from "./routes-portal";
import { registerAdminRoutes } from "./routes-admin";
import { registerOpsRoutes } from "./routes-ops";

export const app = new Hono().basePath("/api");

app.use("*", englishBusinessInput);
app.use("*",async(c,next)=>{
 if(c.req.path==='/api/dev/env-summary')return next();
 const {getDb}=await import('./db');const db=await getDb();
 const [activation]=await db.query("SELECT id FROM recovery_activation WHERE activated_at IS NULL LIMIT 1");
 if(activation)return c.json(err('This restored database has not been activated.','RECOVERY_ACTIVATION_REQUIRED'),503);
 const [pending]=await db.query("SELECT id FROM recovery_holds WHERE status='held' AND acknowledged_at IS NULL LIMIT 1");
 if(pending)return c.json(err('Recovery requires operator acknowledgment before activation.','RECOVERY_ACK_REQUIRED'),503);
 return next();
});

// Internal checkout rows become office orders only after payment. Apply this
// before every office route, including agent routes registered separately.
app.use("/admin/*", async (c, next) => {
 const match = c.req.path.match(/^\/api\/admin\/(orders|services)\/([^/]+)(?:\/|$)/);
 if (!match) return next();
 if (!await requireAdmin(c)) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
 const id = match[2];
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return c.json(err("Not found", "NOT_FOUND"), 404);
 const db = await getDb();
 const table = match[1] === "orders" ? "orders" : "service_orders";
 const [paid] = await db.query(`SELECT id FROM ${table} WHERE id=$1 AND paid_at IS NOT NULL AND status NOT IN ('pending_payment','duplicate_payment')`, [id]);
 if (!paid) return c.json(err("Not found", "NOT_FOUND"), 404);
 return next();
});

registerOfficeUploads(app);
registerPaymentRoutes(app);
registerAgentCheckout(app);
registerAgentOffice(app);
registerPortalRoutes(app);
registerAdminRoutes(app);
registerOfficeRecovery(app);
registerOpsRoutes(app);

app.notFound((c) => c.json(err("Not found", "NOT_FOUND"), 404));
app.onError((e, c) => {
  if(e instanceof OfficeConflict)return c.json(err(e.message,e.code),409);
  if(e instanceof OfficeRecoveryError)return c.json(err(e.message,e.code),e.status);
  if(e instanceof HTTPException)return e.getResponse();
  console.error("[api]", e);
  return c.json(err("Something went wrong on our end.", "INTERNAL"), 500);
});

// The e2e suite imports personLegalName from "./app"; it lives in the portal module.
export { personLegalName } from "./routes-portal";
