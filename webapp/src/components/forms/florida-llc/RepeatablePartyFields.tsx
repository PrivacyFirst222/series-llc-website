import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import { AddressFieldsBlock, US_STATES } from "./AddressFields";
import type { PartyEntry, PartyKind, PartyRole } from "./types";

interface RepeatablePartyFieldsProps {
  entries: PartyEntry[];
  onChange: (next: PartyEntry[]) => void;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const blank = (): PartyEntry => ({
  id: newId(),
  role: "MGR",
  personOrEntity: "INDIVIDUAL",
  fullName: "",
  businessEntityName: "",
  streetAddress1: "",
  streetAddress2: "",
  city: "",
  state: "",
  zip: "",
  country: "United States",
  phone: "",
  email: "",
});

export function RepeatablePartyFields({
  entries,
  onChange,
}: RepeatablePartyFieldsProps) {
  const update = (id: string, patch: Partial<PartyEntry>) =>
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onChange(entries.filter((e) => e.id !== id));
  const add = () => onChange([...entries, blank()]);

  return (
    <div className="space-y-5">
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No managers or authorized representatives added yet.
        </div>
      ) : null}

      {entries.map((entry, idx) => (
        <div
          key={entry.id}
          className="rounded-2xl border border-border bg-card p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              {entry.role === "MGR" ? "Manager" : "Authorized Rep"} #{idx + 1}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(entry.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldShell label="Role" required>
              <select
                value={entry.role}
                onChange={(e) =>
                  update(entry.id, { role: e.target.value as PartyRole })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="MGR">MGR — Manager</option>
                <option value="AR">AR — Authorized Representative</option>
              </select>
            </FieldShell>

            <FieldShell label="Type" required>
              <select
                value={entry.personOrEntity}
                onChange={(e) =>
                  update(entry.id, {
                    personOrEntity: e.target.value as PartyKind,
                  })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="ENTITY">Business Entity</option>
              </select>
            </FieldShell>

            {entry.personOrEntity === "INDIVIDUAL" ? (
              <FieldShell
                label="Full name"
                required
                className="md:col-span-2"
              >
                <Input
                  value={entry.fullName ?? ""}
                  onChange={(e) =>
                    update(entry.id, { fullName: e.target.value })
                  }
                />
              </FieldShell>
            ) : (
              <FieldShell
                label="Business entity name"
                required
                className="md:col-span-2"
              >
                <Input
                  value={entry.businessEntityName ?? ""}
                  onChange={(e) =>
                    update(entry.id, {
                      businessEntityName: e.target.value,
                    })
                  }
                />
              </FieldShell>
            )}
          </div>

          <AddressFieldsBlock
            prefix={`party-${entry.id}`}
            value={{
              address1: entry.streetAddress1,
              address2: entry.streetAddress2,
              city: entry.city,
              state: entry.state,
              zip: entry.zip,
              country: entry.country,
            }}
            onChange={(addr) =>
              update(entry.id, {
                streetAddress1: addr.address1,
                streetAddress2: addr.address2,
                city: addr.city,
                state: addr.state,
                zip: addr.zip,
                country: addr.country,
              })
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldShell label="Phone (optional)">
              <Input
                value={entry.phone ?? ""}
                onChange={(e) =>
                  update(entry.id, { phone: e.target.value })
                }
              />
            </FieldShell>
            <FieldShell label="Email (optional)">
              <Input
                type="email"
                value={entry.email ?? ""}
                onChange={(e) =>
                  update(entry.id, { email: e.target.value })
                }
              />
            </FieldShell>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={add}
        className="rounded-full"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Add manager / authorized representative
      </Button>

      <p className="text-xs text-muted-foreground">
        States available include {US_STATES.length} U.S. states. International
        managers/AR addresses can use a country-specific state.
      </p>
    </div>
  );
}

export { blank as newPartyEntry };
