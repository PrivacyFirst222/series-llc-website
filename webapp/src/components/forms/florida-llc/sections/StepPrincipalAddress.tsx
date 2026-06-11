import { AddressFieldsBlock } from "../AddressFields";
import { isPoBox } from "../schema";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepPrincipalAddress({ data, patch, errors }: StepProps) {
  const poBoxError =
    isPoBox(data.principalAddress.address1) ||
    isPoBox(data.principalAddress.address2 ?? "")
      ? "A P.O. Box cannot be used for the principal office address."
      : undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Principal office address</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          This should be the street address of the LLC's principal office.
          P.O. boxes are not accepted for the principal office.
        </p>
      </header>

      <AddressFieldsBlock
        prefix="principal"
        value={data.principalAddress}
        onChange={(v) => patch({ principalAddress: v })}
        errors={{
          address1: poBoxError ?? errors["principalAddress.address1"],
          city: errors["principalAddress.city"],
          state: errors["principalAddress.state"],
          zip: errors["principalAddress.zip"],
          country: errors["principalAddress.country"],
        }}
      />
    </div>
  );
}
