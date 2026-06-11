import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldShellProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  helper?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function FieldShell({
  label,
  htmlFor,
  required,
  helper,
  error,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-foreground/90"
      >
        {label}
        {required ? <span className="ml-0.5 text-accent">*</span> : null}
      </label>
      {children}
      {helper ? (
        <p className="text-xs text-muted-foreground leading-relaxed">{helper}</p>
      ) : null}
      {error ? (
        <p
          className="text-xs font-medium text-destructive"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface AcknowledgeBoxProps {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  error?: string;
}

export function AcknowledgeBox({
  id,
  checked,
  onChange,
  label,
  error,
}: AcknowledgeBoxProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className={cn(
          "flex items-start gap-3 rounded-lg border bg-card p-3.5 cursor-pointer transition-colors",
          checked
            ? "border-trust/50 bg-trust/5"
            : "border-border hover:border-foreground/30",
          error ? "border-destructive/60" : "",
        )}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-trust"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <span className="text-sm text-foreground/85 leading-relaxed">{label}</span>
      </label>
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
