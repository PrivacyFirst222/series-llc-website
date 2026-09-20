import type { MiddlewareHandler } from "hono";
import { englishTextProblems, ENGLISH_TEXT_ERROR } from "../src/lib/englishText";
import { err } from "./shared";

/** Validate before route side effects. Reading a clone preserves every route's body. */
export const englishBusinessInput: MiddlewareHandler = async (c, next) => {
  if (!["POST", "PUT", "PATCH"].includes(c.req.method) || /\/(?:webhooks?|cron)(?:\/|$)/.test(c.req.path)) return next();
  const type = c.req.header("content-type") ?? "";
  let value: unknown;
  try {
    if (type.includes("application/json")) value = await c.req.raw.clone().json();
    else if (type.includes("multipart/form-data")) {
      const form = await c.req.raw.clone().formData();
      value = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    } else return next();
  } catch { return next(); } // The route retains its existing malformed-body response.
  const fields = englishTextProblems(value);
  if (Object.keys(fields).length) return c.json({ ...err(ENGLISH_TEXT_ERROR, "INVALID_INPUT"), fields }, 400);
  return next();
};
