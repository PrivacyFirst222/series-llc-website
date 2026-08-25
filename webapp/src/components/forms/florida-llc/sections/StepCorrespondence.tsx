import { useEffect } from "react";
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

const blankAddress = () => ({
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  country: "United States",
});

export function StepCorrespondence({ data, patch, errors }: StepProps) {
  // Starts as the client — that's who correspondence belongs to unless they
  // say otherwise. Filled once when the fields are still blank; anything the
  // client edits afterwards stays edited.
  useEffect(() => {
    if (data.correspondentName || data.correspondentEmail) return;
    const name = [data.clientFirstName, data.clientLastName]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    if (!name && !data.clientEmail) return;
    patch({
      correspondentName: name,
      correspondentEmail: data.clientEmail,
      confirmCorrespondentEmail: data.clientEmail,
      correspondentPhone: data.clientPhone ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emailMismatch =
    data.correspondentEmail &&
    data.confirmCorrespondentEmail &&
    data.correspondentEmail !== data.confirmCorrespondentEmail
      ? "Emails do not match."
      : undefined;

  const hasAddress = Boolean(data.correspondentAddress);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Correspondence contact</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          The filing acknowledgment and future email communications may be
          sent to this email address.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldShell
          label="Contact name"
          required
          error={errors.correspondentName}
        >
          <Input
            value={data.correspondentName}
            onChange={(e) => patch({ correspondentName: e.target.value })}
          />
        </FieldShell>
        <FieldShell label="Company (optional)">
          <Input
            value={data.correspondentCompany ?? ""}
            onChange={(e) =>
              patch({ correspondentCompany: e.target.value })
            }
          />
        </FieldShell>

        <FieldShell
          label="Email"
          required
          error={errors.correspondentEmail}
        >
          <Input
            type="email"
            value={data.correspondentEmail}
            onChange={(e) => patch({ correspondentEmail: cleanEmailInput(e.target.value) })}
          />
        </FieldShell>
        <FieldShell
          label="Confirm email"
          required
          error={emailMismatch ?? errors.confirmCorrespondentEmail}
        >
          <Input
            type="email"
            value={data.confirmCorrespondentEmail}
            onChange={(e) =>
              patch({ confirmCorrespondentEmail: cleanEmailInput(e.target.value) })
            }
          />
        </FieldShell>
        <FieldShell label="Phone (optional)">
          <Input
            value={data.correspondentPhone ?? ""}
            onChange={(e) =>
              patch({ correspondentPhone: e.target.value })
            }
          />
        </FieldShell>
      </div>

      <FieldShell label="Mailing address (optional)">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasAddress}
            onChange={(e) =>
              patch({
                correspondentAddress: e.target.checked
                  ? blankAddress()
                  : undefined,
              })
            }
            className="h-4 w-4 accent-trust"
          />
          Add a mailing address for paper correspondence
        </label>
      </FieldShell>

      {hasAddress && data.correspondentAddress ? (
        <AddressFieldsBlock
          prefix="corres"
          value={data.correspondentAddress}
          onChange={(v) => patch({ correspondentAddress: v })}
        />
      ) : null}
    </div>
  );
}
