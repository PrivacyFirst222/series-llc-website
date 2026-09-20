import * as React from "react";

import { englishTextError, unsupportedEnglishCharacters } from "@/lib/englishText";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, ...props }, ref) => {
    const [typed, setTyped] = React.useState(() => String(props.defaultValue ?? ""));
    const errorId = React.useId();
    const element = React.useRef<HTMLInputElement | null>(null);
    const checksText = !type || ["text", "email", "tel", "search", "url"].includes(type);
    const problem = checksText ? englishTextError(String(props.value ?? typed)) : null;
    React.useEffect(() => { element.current?.setCustomValidity(problem ?? ""); }, [problem]);
    return (
      <>
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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
          const message = checksText ? englishTextError(event.currentTarget.value) : null;
          event.currentTarget.setCustomValidity(message ?? "");
          onChange?.(event);
        }}
      />
      {problem && <span id={errorId} role="alert" className="block text-sm text-red-700">{problem} <mark>{unsupportedEnglishCharacters(String(props.value ?? typed)).join(" ")}</mark></span>}
    </>
    );
  },
);
Input.displayName = "Input";

export { Input };
