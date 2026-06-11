import { AddressFieldsBlock } from "../AddressFields";
import { FieldShell } from "../FieldShell";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepMailingAddress({ data, patch, errors }: StepProps) {
  const same = data.mailingSameAsPrincipal;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Mailing address</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Florida allows the mailing address to be different from the principal
          office address. A P.O. Box is acceptable for the mailing address.
        </p>
      </header>

      <FieldShell label="Mailing address option">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mailing"
              checked={same}
              onChange={() =>
                patch({
                  mailingSameAsPrincipal: true,
                  mailingAddress: { ...data.principalAddress },
                })
              }
              className="h-4 w-4 accent-trust"
            />
            Same as principal office address
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mailing"
              checked={!same}
              onChange={() => patch({ mailingSameAsPrincipal: false })}
              className="h-4 w-4 accent-trust"
            />
            Use a different mailing address
          </label>
        </div>
      </FieldShell>

      {!same ? (
        <AddressFieldsBlock
          prefix="mailing"
          value={data.mailingAddress}
          onChange={(v) => patch({ mailingAddress: v })}
          errors={{
            address1: errors["mailingAddress.address1"],
            city: errors["mailingAddress.city"],
            state: errors["mailingAddress.state"],
            zip: errors["mailingAddress.zip"],
            country: errors["mailingAddress.country"],
          }}
        />
      ) : null}
    </div>
  );
}
