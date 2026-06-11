import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import { AddressFieldsBlock } from "./AddressFields";
import type { MemberEntry, PartyKind } from "./types";

interface RepeatableMemberFieldsProps {
  members: MemberEntry[];
  onChange: (next: MemberEntry[]) => void;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const blank = (): MemberEntry => ({
  id: newId(),
  memberType: "INDIVIDUAL",
  fullLegalName: "",
  entityName: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  country: "United States",
  ownershipPercentage: undefined,
  capitalContribution: undefined,
  email: "",
  phone: "",
  isInitialMember: true,
});

export function RepeatableMemberFields({
  members,
  onChange,
}: RepeatableMemberFieldsProps) {
  const update = (id: string, patch: Partial<MemberEntry>) =>
    onChange(members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const remove = (id: string) => onChange(members.filter((m) => m.id !== id));
  const add = () => onChange([...members, blank()]);

  return (
    <div className="space-y-5">
      {members.map((entry, idx) => (
        <div
          key={entry.id}
          className="rounded-2xl border border-border bg-card p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Member #{idx + 1}</div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(entry.id)}
              className="text-muted-foreground hover:text-destructive"
              disabled={members.length === 1}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldShell label="Member type" required>
              <select
                value={entry.memberType}
                onChange={(e) =>
                  update(entry.id, {
                    memberType: e.target.value as PartyKind,
                  })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="ENTITY">Entity</option>
              </select>
            </FieldShell>

            <FieldShell label="Initial member?">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={entry.isInitialMember}
                  onChange={(e) =>
                    update(entry.id, { isInitialMember: e.target.checked })
                  }
                  className="h-4 w-4 accent-trust"
                />
                Yes — initial member at formation
              </label>
            </FieldShell>

            {entry.memberType === "INDIVIDUAL" ? (
              <FieldShell
                label="Full legal name"
                required
                className="md:col-span-2"
              >
                <Input
                  value={entry.fullLegalName ?? ""}
                  onChange={(e) =>
                    update(entry.id, { fullLegalName: e.target.value })
                  }
                />
              </FieldShell>
            ) : (
              <FieldShell
                label="Entity name"
                required
                className="md:col-span-2"
              >
                <Input
                  value={entry.entityName ?? ""}
                  onChange={(e) =>
                    update(entry.id, { entityName: e.target.value })
                  }
                />
              </FieldShell>
            )}
          </div>

          <AddressFieldsBlock
            prefix={`mem-${entry.id}`}
            value={{
              address1: entry.address1,
              address2: entry.address2,
              city: entry.city,
              state: entry.state,
              zip: entry.zip,
              country: entry.country,
            }}
            onChange={(addr) =>
              update(entry.id, {
                address1: addr.address1,
                address2: addr.address2,
                city: addr.city,
                state: addr.state,
                zip: addr.zip,
                country: addr.country,
              })
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldShell
              label="Ownership %"
              helper="Optional. If used, all members combined should equal 100%."
            >
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={
                  entry.ownershipPercentage === undefined
                    ? ""
                    : entry.ownershipPercentage
                }
                onChange={(e) =>
                  update(entry.id, {
                    ownershipPercentage:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </FieldShell>
            <FieldShell label="Capital contribution (USD, optional)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={
                  entry.capitalContribution === undefined
                    ? ""
                    : entry.capitalContribution
                }
                onChange={(e) =>
                  update(entry.id, {
                    capitalContribution:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
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
            <FieldShell label="Phone (optional)">
              <Input
                value={entry.phone ?? ""}
                onChange={(e) =>
                  update(entry.id, { phone: e.target.value })
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
        Add member
      </Button>
    </div>
  );
}

export { blank as newMemberEntry };
