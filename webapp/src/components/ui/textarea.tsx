import * as React from "react";

import { englishTextError, unsupportedEnglishCharacters } from "@/lib/englishText";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, onChange, ...props }, ref) => {
  const [typed, setTyped] = React.useState(() => String(props.defaultValue ?? ""));
  const errorId = React.useId();
    const element = React.useRef<HTMLTextAreaElement | null>(null);
  const problem = englishTextError(String(props.value ?? typed));
    React.useEffect(() => { element.current?.setCustomValidity(problem ?? ""); }, [problem]);
  return (
    <>
      <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        problem && "border-red-700 ring-1 ring-red-700",
        className,
      )}
      ref={(node) => {
          element.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
      {...props}
      aria-invalid={problem ? true : props["aria-invalid"]}
      aria-describedby={[props["aria-describedby"], problem ? errorId : ""].filter(Boolean).join(" ") || undefined}
      onChange={(event) => {
        setTyped(event.currentTarget.value);
        event.currentTarget.setCustomValidity(englishTextError(event.currentTarget.value) ?? "");
        onChange?.(event);
      }}
    />
    {problem && <span id={errorId} role="alert" className="block text-sm text-red-700">{problem} <mark>{unsupportedEnglishCharacters(String(props.value ?? typed)).join(" ")}</mark></span>}
    </>
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
