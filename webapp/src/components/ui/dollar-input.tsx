import { useEffect, useId, useState } from "react";
import { Input } from "./input";

const format = (value: number | undefined) => value === undefined ? "" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const INVALID = "Enter a nonnegative dollar amount with no more than two decimal places.";

/** Retain the typed decimal (including a trailing point) while editing. */
export function DollarInput({ value, onValueChange, onValidityChange, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  onValidityChange: (id: string, valid: boolean) => void;
}) {
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const id = useId();
  useEffect(() => () => onValidityChange(id, true), [id, onValidityChange]);
  useEffect(() => { if (!focused && !invalid) setText(format(value)); }, [value, focused, invalid]);
  return <div>
    <Input {...props} inputMode="decimal" value={text} aria-invalid={invalid} aria-describedby={invalid ? id : props["aria-describedby"]}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (!invalid) setText(format(value)); }}
      onChange={e => {
        const typed = e.target.value;
        setText(typed);
        const clean = typed.trim();
        const valid = clean === "" || /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?$/.test(clean) || /^\.\d{1,2}$/.test(clean);
        const amount = clean === "" ? undefined : Number(clean.replace(/,/g, ""));
        const ok = valid && (amount === undefined || (Number.isFinite(amount) && Number.isSafeInteger(Math.round(amount * 100))));
        setInvalid(!ok); onValidityChange(id, ok);
        if (ok) {
          // Keep grouping while typing without rounding away a trailing dot
          // or a zero in the fractional part.
          if (clean !== "") {
            const [whole, fraction] = clean.replace(/,/g, "").split(".");
            setText(Number(whole || "0").toLocaleString("en-US") + (fraction === undefined ? "" : `.${fraction}`));
          }
          onValueChange(amount);
        }
      }} />
    {invalid ? <p id={id} className="mt-1 text-xs text-destructive" role="alert">{INVALID}</p> : null}
  </div>;
}
