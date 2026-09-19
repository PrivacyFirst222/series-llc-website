import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { FieldShell } from "../FieldShell";
import { cleanEmailInput, fullPersonName } from "../validation";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepCorrespondence({ data, patch, errors }: StepProps) {
  // Starts as the client — that's who correspondence belongs to unless they
  // say otherwise. Filled once when the fields are still blank; anything the
  // client edits afterwards stays edited.
  useEffect(() => {
    if (data.correspondentName || data.correspondentEmail) return;
    const name = fullPersonName(data.clientFirstName, data.clientLastName, data.clientSuffix);
    if (!name && !data.clientEmail) return;
    patch({
      correspondentName: name,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emailMismatch =
    data.correspondentEmail &&
    data.confirmCorrespondentEmail &&
    data.correspondentEmail !== data.confirmCorrespondentEmail
      ? "Emails do not match."
      : undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Correspondence contact</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          The Division of Corporations sends filing emails to your user email
          unless you provide a different email below. Our own emails go to the
          user email you gave at the start.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldShell
          label="Contact name"
          required
          error={errors.correspondentName}
          htmlFor="correspondent-name"
        >
          <Input
            id="correspondent-name"
            value={data.correspondentName}
            onChange={(e) => patch({ correspondentName: e.target.value })}
          />
        </FieldShell>

        <FieldShell
          label="Email (optional)"
          helper="Leave the email blank to use your email from Your information."
          error={errors.correspondentEmail}
          htmlFor="correspondent-email"
        >
          <Input
            id="correspondent-email"
            type="email"
            value={data.correspondentEmail}
            onChange={(e) => patch({ correspondentEmail: cleanEmailInput(e.target.value), ...(!e.target.value.trim() ? { confirmCorrespondentEmail: "" } : {}) })}
          />
        </FieldShell>
        <FieldShell
          label="Confirm email"
          required={Boolean(data.correspondentEmail)}
          error={emailMismatch ?? errors.confirmCorrespondentEmail}
          htmlFor="correspondent-confirm-email"
        >
          <Input
            id="correspondent-confirm-email"
            type="email"
            value={data.confirmCorrespondentEmail}
            onChange={(e) =>
              patch({ confirmCorrespondentEmail: cleanEmailInput(e.target.value) })
            }
          />
        </FieldShell>
      </div>
    </div>
  );
}
