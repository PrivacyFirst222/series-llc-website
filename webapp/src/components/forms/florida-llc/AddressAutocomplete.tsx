import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/** One selectable suggestion, already split into our address fields. */
export interface AddressSuggestion {
  label: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
}

const SMARTY_KEY = import.meta.env.VITE_SMARTY_EMBEDDED_KEY as string | undefined;

interface AddressAutocompleteProps {
  id?: string;
  value: string;
  placeholder?: string;
  "aria-invalid"?: boolean;
  onChangeText: (text: string) => void;
  onSelect: (s: AddressSuggestion) => void;
}

/** Street-address input with Smarty type-ahead. Without a key (or when the
 *  API is unreachable) it is just a normal text input — never blocking. */
export function AddressAutocomplete({
  id,
  value,
  placeholder,
  onChangeText,
  onSelect,
  ...rest
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState<boolean>(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const query = (text: string) => {
    onChangeText(text);
    if (!SMARTY_KEY || text.trim().length < 4) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `https://us-autocomplete-pro.api.smarty.com/lookup?key=${SMARTY_KEY}&search=${encodeURIComponent(text)}&max_results=5`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          suggestions?: {
            street_line?: string;
            secondary?: string;
            city?: string;
            state?: string;
            zipcode?: string;
            entries?: number;
          }[];
        };
        const seen = new Set<string>();
        const next = (body.suggestions ?? [])
          .map((a) => {
            const street = [a.street_line, a.secondary].filter(Boolean).join(" ");
            return {
              label: `${street}, ${a.city} ${a.state} ${a.zipcode}`,
              address1: street,
              city: a.city ?? "",
              state: a.state?.toUpperCase() ?? "",
              zip: a.zipcode ?? "",
            };
          })
          .filter((s) => {
            if (!s.address1 || !s.city) return false;
            // Smarty returns one row per matching unit; collapse duplicates.
            if (seen.has(s.label)) return false;
            seen.add(s.label);
            return true;
          });
        setSuggestions(next);
        setOpen(next.length > 0);
        setHighlight(-1);
      } catch {
        // network/abort — behave like a plain input
      }
    }, 250);
  };

  const choose = (s: AddressSuggestion) => {
    setOpen(false);
    setSuggestions([]);
    onSelect(s);
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => query(e.target.value)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && highlight >= 0) {
            e.preventDefault();
            choose(suggestions[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        {...rest}
      />
      {open ? (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                className={`w-full px-3 py-2.5 text-left text-sm transition-colors ${
                  i === highlight ? "bg-secondary" : "hover:bg-secondary"
                }`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(s)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
