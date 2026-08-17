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

export function passwordChangedEmail(portalUrl: string): { subject: string; html: string } {
  return {
    subject: "Your portal password was changed",
    html: wrap(`
      <p>The password for your MyFloridaSeriesLLC portal account was just changed, and every
      other signed-in device was signed out.</p>
      <p><strong>If you did not do this,</strong> use "Forgot your password" on the sign-in page
      to regain control of the account, and email support@myfloridaseriesllc.com immediately.</p>
      <p><a href="${portalUrl}" style="display:inline-block;background:#0d2e55;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Open your portal</a></p>
    `),
  };
}

/** Sent to the NEW address — clicking the link is what actually changes it. */
export function verifyNewEmail(verifyUrl: string): { subject: string; html: string } {
  return {
    subject: "Confirm your new email address",
    html: wrap(`
      <p>This address was given as the new email for a MyFloridaSeriesLLC portal account.
      Confirm it below within 1 hour and it becomes the address you sign in with, and where we
      send your documents and notices.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;background:#0d2e55;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Confirm this address</a></p>
      <p>Until you confirm, nothing changes. If you were not expecting this, ignore this email.</p>
    `),
  };
}

/** Sent to the OLD address at the same time — this is the anti-hijack notice. */
export function emailChangeRequestedEmail(maskedNew: string): { subject: string; html: string } {
  return {
    subject: "A change to your portal email was requested",
    html: wrap(`
      <p>Someone requested changing the email address on your MyFloridaSeriesLLC portal account
      to <strong>${escapeHtml(maskedNew)}</strong>. The change takes effect only if that address
      is confirmed.</p>
      <p><strong>If this was not you,</strong> sign in and change your password immediately, then
      email support@myfloridaseriesllc.com. This address remains on the account until the new one
      is confirmed.</p>
    `),
  };
}

export function emailChangedEmail(newEmail: string): { subject: string; html: string } {
  return {
    subject: "Your portal email address was changed",
    html: wrap(`
      <p>The email address on your MyFloridaSeriesLLC portal account is now
      <strong>${escapeHtml(newEmail)}</strong>. Sign in with that address from now on.</p>
      <p>If you did not authorize this, email support@myfloridaseriesllc.com immediately.</p>
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

export function raCancellationEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Your registered agent cancellation request",
    html: wrap(`
      <p>Hi ${escapeHtml(name || "there")},</p>
      <p>We received your request to cancel registered agent service. Two things determine
      what happens next:</p>
      <p><strong>1. The renewal charge.</strong> Because you gave notice through your portal,
      your service will not renew at the next renewal date — as long as your notice was given
      at least 30 days before that date.</p>
      <p><strong>2. Removing us as agent of record.</strong> Florida requires your LLC to have
      a registered agent at all times, so you must designate a successor registered agent with
      the Florida Division of Corporations and send written proof (such as the filed change)
      to support@myfloridaseriesllc.com. Until we receive that proof, we remain your agent of
      record and service is billed at the then-current rate, prorated monthly, as described in
      the Terms of Service.</p>
      <p>Questions? Just reply to this email.</p>
    `),
  };
}

export function raCancellationAdminEmail(opts: {
  clientName: string;
  clientEmail: string;
}): { subject: string; html: string } {
  return {
    subject: `RA cancellation requested — ${opts.clientName || opts.clientEmail}`,
    html: wrap(`
      <p><strong>${escapeHtml(opts.clientName)}</strong> &lt;${escapeHtml(opts.clientEmail)}&gt;
      requested cancellation of registered agent service through the portal.</p>
      <p>Renewal billing should stop once their notice window is satisfied; watch for proof of
      a successor designation before treating the agency as terminated.</p>
    `),
  };
}

export function serviceOrderClientEmail(opts: {
  type: "series" | "ein" | "s-election";
  summary: string;
  needsInfo: boolean;
  portalUrl: string;
}): { subject: string; html: string } {
  const subject =
    opts.type === "series"
      ? "Your Protected Series order is confirmed"
      : opts.type === "s-election"
        ? "Your S corporation election order is confirmed"
        : "Your EIN order is confirmed";
  const action = opts.needsInfo
    ? opts.type === "s-election"
      ? `<p><strong>One step is needed from you:</strong> sign in to your portal and provide the
         election details (owners, ownership percentages, and identification numbers) through the
         secure form. We cannot prepare Form 2553 until you do. The election has a strict IRS
         deadline, so please do this promptly. For your security, never send Social Security
         numbers by email.</p>`
      : `<p><strong>One step is needed from you:</strong> sign in to your portal and provide the
       responsible party's details through the secure form. We cannot obtain the EIN until you do.
       For your security, never send Social Security numbers by email.</p>`
    : `<p>No further action is needed from you. We'll post the confirmation to your portal when
       the work is complete.</p>`;
  return {
    subject,
    html: wrap(`
      <p>Thanks — payment received for: <strong>${escapeHtml(opts.summary)}</strong>.</p>
      ${action}
      <p><a href="${opts.portalUrl}" style="display:inline-block;background:#0d2e55;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Open your portal</a></p>
    `),
  };
}

export function serviceOrderAdminEmail(opts: {
  type: string;
  summary: string;
  clientName: string;
  clientEmail: string;
  amountCents: number;
  adminUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Paid service order — ${opts.summary}`,
    html: wrap(`
      <p><strong>${escapeHtml(opts.summary)}</strong> — $${(opts.amountCents / 100).toFixed(2)} paid.</p>
      <p>${escapeHtml(opts.clientName)} &lt;${escapeHtml(opts.clientEmail)}&gt;</p>
      <p><a href="${opts.adminUrl}">Open admin</a></p>
    `),
  };
}

export function einDetailsSubmittedAdminEmail(opts: {
  summary: string;
  clientEmail: string;
  adminUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `EIN details submitted — ready to file (${opts.clientEmail})`,
    html: wrap(`
      <p>The responsible-party details for <strong>${escapeHtml(opts.summary)}</strong> have been
      submitted through the portal. View them once in the admin dashboard; the identification
      number is deleted automatically when you mark the order fulfilled.</p>
      <p><a href="${opts.adminUrl}">Open admin</a></p>
    `),
  };
}

export function serviceFulfilledClientEmail(opts: {
  summary: string;
  portalUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "Your order is complete",
    html: wrap(`
      <p><strong>${escapeHtml(opts.summary)}</strong> is complete. Any related documents have been
      posted to your client portal.</p>
      <p><a href="${opts.portalUrl}" style="display:inline-block;background:#0d2e55;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Open your portal</a></p>
    `),
  };
}

export function sElectionReadyEmail(opts: {
  llcName: string;
  editableUntil: string;
  portalUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Your Form 2553 package is ready — ${opts.llcName}`,
    html: wrap(`
      <p>Your S corporation election package for <strong>${escapeHtml(opts.llcName)}</strong> is
      ready to download in your portal: the completed IRS Form 2553, a cover letter, and
      step-by-step instructions for signing and mailing it to the IRS.</p>
      <p>You can correct your answers and regenerate the package until
      <strong>${escapeHtml(opts.editableUntil)}</strong>. After that we permanently delete every
      Social Security number from our systems and replace your copy with a record copy that shows
      only the last four digits and cannot be filed with the IRS —
      <strong>download the filing copy before then</strong>.</p>
      <p><a href="${opts.portalUrl}" style="display:inline-block;background:#0d2e55;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Open your portal</a></p>
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

/** The company exists. This is the message the whole formation was for, so it
 *  names the company and lists what is now in the client's portal rather than
 *  saying "a new document is available" like every other upload. */
export function llcFormedEmail(opts: {
  llcName: string;
  seriesNames: string[];
  portalUrl: string;
}): { subject: string; html: string } {
  const series = opts.seriesNames.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  return {
    subject: `${opts.llcName} is formed`,
    html: wrap(`
      <p><strong>${escapeHtml(opts.llcName)}</strong> has been formed with the Florida
      Division of Corporations.</p>
      <p>Two things are waiting in your portal, ready to download:</p>
      <ul>
        <li>Your <strong>Articles of Organization</strong>, as filed</li>
        <li>Your <strong>Protected Series Designation</strong>${opts.seriesNames.length > 1 ? "s" : ""},
            as filed, covering:</li>
      </ul>
      <ul>${series}</ul>
      <p>Keep both with your company records — a bank, a title company, or a
      closing agent will ask for them.</p>
      <p><a href="${opts.portalUrl}">Open your portal</a></p>
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
