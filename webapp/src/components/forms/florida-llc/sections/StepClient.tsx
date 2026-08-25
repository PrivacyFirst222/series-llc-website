import { Input } from "@/components/ui/input";
import { FieldShell } from "../FieldShell";
import { AddressFieldsBlock } from "../AddressFields";
import { cleanEmailInput } from "../validation";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

/** Who the client is — asked once, up front. Everything that belongs to a
 *  person later in the form (portal account, correspondence, managers,
 *  registered agent, signature) starts from these answers instead of making
 *  the client retype them. */
export function StepClient({ data, patch, errors }: StepProps) {
  const emailMismatch =
    data.clientEmail &&
    data.confirmClientEmail &&
    data.clientEmail !== data.confirmClientEmail
      ? "Emails do not match."
      : undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Your information</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Tell us who you are. Your client portal, your formation documents,
          and our emails about your LLC all belong to the person named here —
          and later questions offer your name and address wherever they fit,
          so you won't retype them.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldShell label="First name" required error={errors.clientFirstName}>
          <Input
            value={data.clientFirstName}
            onChange={(e) => patch({ clientFirstName: e.target.value })}
            autoComplete="given-name"
          />
        </FieldShell>
        <FieldShell label="Last name" required error={errors.clientLastName}>
          <Input
            value={data.clientLastName}
            onChange={(e) => patch({ clientLastName: e.target.value })}
            autoComplete="family-name"
          />
        </FieldShell>
        <FieldShell label="Suffix (optional)" error={errors.clientSuffix}>
          <Input
            value={data.clientSuffix ?? ""}
            onChange={(e) => patch({ clientSuffix: e.target.value })}
            placeholder="Jr, Sr, III…"
            autoComplete="honorific-suffix"
          />
        </FieldShell>
        <FieldShell label="Email" required error={errors.clientEmail}>
          <Input
            type="email"
            value={data.clientEmail}
            onChange={(e) => patch({ clientEmail: cleanEmailInput(e.target.value) })}
            autoComplete="email"
          />
        </FieldShell>
        <FieldShell
          label="Confirm email"
          required
          error={emailMismatch ?? errors.confirmClientEmail}
        >
          <Input
            type="email"
            value={data.confirmClientEmail}
            onChange={(e) =>
              patch({ confirmClientEmail: cleanEmailInput(e.target.value) })
            }
            autoComplete="email"
          />
        </FieldShell>
        <FieldShell label="Phone (optional)" error={errors.clientPhone}>
          <Input
            type="tel"
            value={data.clientPhone ?? ""}
            onChange={(e) => patch({ clientPhone: e.target.value })}
            autoComplete="tel"
          />
        </FieldShell>
      </div>

      <FieldShell label="Your address" required error={errors.clientAddress}>
        <AddressFieldsBlock
          prefix="client"
          value={data.clientAddress}
          onChange={(v) => patch({ clientAddress: v })}
        />
      </FieldShell>
    </div>
  );
}
