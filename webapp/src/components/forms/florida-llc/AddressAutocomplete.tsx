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

const RADAR_KEY = import.meta.env.VITE_RADAR_PUBLISHABLE_KEY as string | undefined;

interface AddressAutocompleteProps {
  id?: string;
  value: string;
  placeholder?: string;
  "aria-invalid"?: boolean;
  onChangeText: (text: string) => void;
  onSelect: (s: AddressSuggestion) => void;
}

/** Street-address input with Radar type-ahead. Without a key (or when the
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
    if (!RADAR_KEY || text.trim().length < 4) {
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
          `https://api.radar.io/v1/search/autocomplete?query=${encodeURIComponent(text)}&countryCode=US&layers=address&limit=5`,
          { headers: { Authorization: RADAR_KEY }, signal: controller.signal },
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          addresses?: {
            addressLabel?: string;
            formattedAddress?: string;
            number?: string;
            street?: string;
            city?: string;
            stateCode?: string;
            postalCode?: string;
          }[];
        };
        const next = (body.addresses ?? [])
          .map((a) => ({
            label: a.formattedAddress || a.addressLabel || "",
            address1: a.addressLabel || [a.number, a.street].filter(Boolean).join(" "),
            city: a.city ?? "",
            state: a.stateCode ?? "",
            zip: a.postalCode ?? "",
          }))
          .filter((s) => s.address1 && s.city);
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
