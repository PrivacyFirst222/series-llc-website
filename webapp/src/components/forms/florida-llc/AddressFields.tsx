import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import type { AddressFields as AddressType } from "./types";

export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

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
        <Input
          id={`${prefix}-address1`}
          value={value.address1}
          onChange={(e) => set("address1", e.target.value)}
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
        <select
          id={`${prefix}-state`}
          value={value.state}
          onChange={(e) => set("state", e.target.value)}
          disabled={Boolean(lockState)}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-70"
        >
          <option value="">Select…</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
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
    </div>
  );
}
