import { env } from "./env";

interface Mail {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/** Sends via Resend; without an API key, logs instead (dev). */
export async function sendMail(mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${mail.to} subject="${mail.subject}"\n${mail.html}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      reply_to: mail.replyTo,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

const wrap = (inner: string) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c2530;max-width:560px;margin:0 auto;padding:24px">
  <p style="font-weight:700;font-size:18px;margin:0 0 16px">MyFloridaSeriesLLC</p>
  ${inner}
  <p style="color:#8a8f98;font-size:12px;margin-top:28px">MyFloridaSeriesLLC — support@myfloridaseriesllc.com</p>
</div>`;

export function welcomeEmail(name: string, setPasswordUrl: string): { subject: string; html: string } {
  return {
    subject: "Your MyFloridaSeriesLLC client portal",
    html: wrap(`
      <p>Hi ${escapeHtml(name || "there")},</p>
      <p>Thanks for your order. Your client portal is ready — it's where your formation
      documents will be posted, and where any legal mail we receive as your registered
      agent will be available to download.</p>
      <p><a href="${setPasswordUrl}" style="display:inline-block;background:#0d2e55;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Set your password</a></p>
      <p style="color:#555;font-size:13px">This link expires in 7 days. If it expires, use
      "Forgot password" on the portal sign-in page with this email address.</p>
    `),
  };
}

export function resetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: "Reset your portal password",
    html: wrap(`
      <p>Someone requested a password reset for your MyFloridaSeriesLLC portal account.
      If this was you, use the button below within 1 hour. If not, you can ignore this email.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#0d2e55;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
    `),
  };
}

export function newDocumentEmail(portalUrl: string): { subject: string; html: string } {
  return {
    subject: "A new document is available in your portal",
    html: wrap(`
      <p>A new document has been added to your MyFloridaSeriesLLC client portal.</p>
      <p><a href="${portalUrl}" style="display:inline-block;background:#0d2e55;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Sign in to view it</a></p>
    `),
  };
}

export function orderPaidEmail(opts: {
  llcName: string;
  contactName: string;
  contactEmail: string;
  totalCents: number;
  orderId: string;
  adminUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Paid order — ${opts.llcName}`,
    html: wrap(`
      <p><strong>${escapeHtml(opts.llcName)}</strong> — $${(opts.totalCents / 100).toFixed(2)} paid.</p>
      <p>${escapeHtml(opts.contactName)} &lt;${escapeHtml(opts.contactEmail)}&gt;</p>
      <p>Order ${opts.orderId}</p>
      <p><a href="${opts.adminUrl}">Open admin</a></p>
    `),
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
