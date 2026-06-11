import { Hono } from "hono";
import nodemailer from "nodemailer";
import { env } from "../env";

const intakeRouter = new Hono();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined || value === "") {
    return `<span style="color:#999">—</span>`;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number" || typeof value === "string") {
    return escapeHtml(String(value));
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `<span style="color:#999">(none)</span>`;
    return `<ol style="margin:4px 0 4px 20px;padding:0">${value
      .map((v) => `<li style="margin-bottom:6px">${renderValue(v, depth + 1)}</li>`)
      .join("")}</ol>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `<span style="color:#999">(empty)</span>`;
    return `<table style="border-collapse:collapse;width:100%;margin:4px 0">${entries
      .map(
        ([k, v]) =>
          `<tr>
             <td style="vertical-align:top;padding:4px 8px;color:#444;font-weight:600;border-bottom:1px solid #eee;width:35%">${escapeHtml(k)}</td>
             <td style="vertical-align:top;padding:4px 8px;border-bottom:1px solid #eee">${renderValue(v, depth + 1)}</td>
           </tr>`,
      )
      .join("")}</table>`;
  }
  return escapeHtml(String(value));
}

function buildEmailHtml(payload: Record<string, unknown>): string {
  const submittedAt =
    (payload?.metadata as any)?.submittedAt ?? new Date().toISOString();
  const finalName =
    (payload?.llcName as any)?.finalName ??
    (payload?.llcName as any)?.desiredName ??
    "(unnamed)";
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;max-width:780px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 4px">New Florida Protected Series LLC intake</h2>
  <p style="margin:0 0 16px;color:#555">Submitted ${escapeHtml(String(submittedAt))}</p>
  <p style="margin:0 0 24px"><strong>LLC name:</strong> ${escapeHtml(String(finalName))}</p>
  ${renderValue(payload)}
</body></html>`;
}

function buildEmailText(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 2);
}

intakeRouter.post("/submit", async (c) => {
  let payload: Record<string, unknown>;
  try {
    payload = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json(
      { error: { message: "Invalid JSON body", code: "INVALID_JSON" } },
      400,
    );
  }

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.error("[intake] SMTP credentials are not configured");
    return c.json(
      {
        error: {
          message: "Email is not configured on the server.",
          code: "SMTP_NOT_CONFIGURED",
        },
      },
      500,
    );
  }

  const port = Number(env.SMTP_PORT) || 465;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  const finalName =
    (payload?.llcName as any)?.finalName ??
    (payload?.llcName as any)?.desiredName ??
    "Unnamed LLC";
  const correspondentEmail = (payload?.correspondence as any)?.email as
    | string
    | undefined;

  try {
    const info = await transporter.sendMail({
      from: `"Privacy First intake" <${env.SMTP_USER}>`,
      to: env.INTAKE_TO_EMAIL,
      replyTo: correspondentEmail || undefined,
      subject: `New intake — ${finalName}`,
      text: buildEmailText(payload),
      html: buildEmailHtml(payload),
    });
    console.log(`[intake] email sent: ${info.messageId}`);
  } catch (err) {
    console.error("[intake] failed to send email:", err);
    return c.json(
      {
        error: {
          message: "Failed to send intake email.",
          code: "EMAIL_SEND_FAILED",
        },
      },
      502,
    );
  }

  return c.json({ data: { ok: true } });
});

export { intakeRouter };
