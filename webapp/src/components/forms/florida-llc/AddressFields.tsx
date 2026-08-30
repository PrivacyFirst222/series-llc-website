import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldShell } from "./FieldShell";
import { US_STATES } from "./us-states";
import { AddressAutocomplete } from "./AddressAutocomplete";
import type { AddressFields as AddressType } from "./types";


interface AddressFieldsProps {
  prefix: string;
  value: AddressType;
  onChange: (value: AddressType) => void;
  errors?: Partial<Record<keyof AddressType, string>>;
  lockState?: string;
  hideAddress2?: boolean;
}

export function AddressFieldsBlock({
  prefix,
  value,
  onChange,
  errors,
  lockState,
  hideAddress2,
}: AddressFieldsProps) {
  const set = <K extends keyof AddressType>(k: K, v: AddressType[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
      <FieldShell
        label="Street address"
        htmlFor={`${prefix}-address1`}
        required
        error={errors?.address1}
        className="md:col-span-6"
      >
        <AddressAutocomplete
          id={`${prefix}-address1`}
          value={value.address1}
          onChangeText={(text) => set("address1", text)}
          onSelect={(s) =>
            onChange({
              ...value,
              address1: s.address1,
              city: s.city,
              state: lockState ?? s.state,
              zip: s.zip,
              country: "United States",
            })
          }
          placeholder="123 Main St"
          aria-invalid={Boolean(errors?.address1)}
        />
      </FieldShell>

      {!hideAddress2 ? (
        <FieldShell
          label="Suite / Unit (optional)"
          htmlFor={`${prefix}-address2`}
          className="md:col-span-6"
        >
          <Input
            id={`${prefix}-address2`}
            value={value.address2 ?? ""}
            onChange={(e) => set("address2", e.target.value)}
          />
        </FieldShell>
      ) : null}

      <FieldShell
        label="City"
        htmlFor={`${prefix}-city`}
        required
        error={errors?.city}
        className="md:col-span-3"
      >
        <Input
          id={`${prefix}-city`}
          value={value.city}
          onChange={(e) => set("city", e.target.value)}
        />
      </FieldShell>

      <FieldShell
        label="State"
        htmlFor={`${prefix}-state`}
        required
        error={errors?.state}
        className="md:col-span-2"
      >
        <Select
          value={value.state}
          onValueChange={(v) => set("state", v)}
          disabled={Boolean(lockState)}
        >
          <SelectTrigger id={`${prefix}-state`}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {US_STATES.map((s) => (
              <SelectItem key={s.code} value={s.code}>
                {s.code} — {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>

      <FieldShell
        label="ZIP"
        htmlFor={`${prefix}-zip`}
        required
        error={errors?.zip}
        className="md:col-span-1"
      >
        <Input
          id={`${prefix}-zip`}
          value={value.zip}
          onChange={(e) => set("zip", e.target.value)}
          inputMode="numeric"
        />
      </FieldShell>

      <FieldShell
        label="Country"
        htmlFor={`${prefix}-country`}
        required
        error={errors?.country}
        className="md:col-span-6"
      >
        <Input
          id={`${prefix}-country`}
          value={value.country}
          onChange={(e) => set("country", e.target.value)}
        />
      </FieldShell>

      <p className="md:col-span-6 text-xs leading-relaxed text-muted-foreground">
        We prepare your filing using this address exactly as entered. Please
        double-check it — an incorrect address can cause missed legal notices
        and state correspondence. Address suggestions are a convenience, not a
        verification.
      </p>
    </div>
  );
}
