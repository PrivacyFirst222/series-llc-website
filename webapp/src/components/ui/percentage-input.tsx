import { useEffect, useId, useState } from "react";
import { Input } from "./input";

const format = (value: number | undefined) => value === undefined ? "" : String(value);

/** Keep the decimal text while typing; never save invalid text as NaN/null. */
export function PercentageInput({ value, onValueChange, onValidityChange, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
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
      onChange={event => {
        const typed = event.target.value;
        setText(typed);
        const clean = typed.trim();
        const amount = clean === "" ? undefined : Number(clean);
        const ok = (clean === "" || /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean))
          && (amount === undefined || (Number.isFinite(amount) && amount >= 0 && amount <= 100));
        setInvalid(!ok);
        onValidityChange(id, ok);
        if (ok) onValueChange(amount);
      }} />
    {invalid ? <p id={id} className="mt-1 text-xs text-destructive" role="alert">Enter a percentage from 0 to 100.</p> : null}
  </div>;
}
