import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldShell } from "./FieldShell";
import { AddressFieldsBlock } from "./AddressFields";
import type { MemberEntry, PartyKind } from "./types";

interface RepeatableMemberFieldsProps {
  members: MemberEntry[];
  onChange: (next: MemberEntry[]) => void;
  /** Step errors keyed "members.<index>.<field>" (14 Sep 2026: they were
   *  computed and never shown, so Continue silently did nothing). */
  errors?: Record<string, string>;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const blank = (): MemberEntry => ({
  id: newId(),
  memberType: "INDIVIDUAL",
  firstName: "",
  lastName: "",
  suffix: "",
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
  errors = {},
}: RepeatableMemberFieldsProps) {
  const rowError = (i: number, field: string) => errors[`members.${i}.${field}`];
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
            <FieldShell label="Member type" required htmlFor={`member-${entry.id}-type`}>
              <Select
                value={entry.memberType}
                onValueChange={(v) =>
                  update(entry.id, { memberType: v as PartyKind })
                }
              >
                <SelectTrigger id={`member-${entry.id}-type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="ENTITY">Entity</SelectItem>
                </SelectContent>
              </Select>
            </FieldShell>

            {entry.memberType === "INDIVIDUAL" ? (
              <div className="grid grid-cols-2 gap-4 md:col-span-2 md:grid-cols-3">
                <FieldShell label="First name" required htmlFor={`member-${entry.id}-first`} error={rowError(idx, "firstName")}>
                  <Input
                    id={`member-${entry.id}-first`}
                    aria-invalid={!!rowError(idx, "firstName")}
                    value={entry.firstName ?? ""}
                    onChange={(e) =>
                      update(entry.id, { firstName: e.target.value })
                    }
                  />
                </FieldShell>
                <FieldShell label="Last name" required htmlFor={`member-${entry.id}-last`} error={rowError(idx, "lastName")}>
                  <Input
                    id={`member-${entry.id}-last`}
                    aria-invalid={!!rowError(idx, "lastName")}
                    value={entry.lastName ?? ""}
                    onChange={(e) =>
                      update(entry.id, { lastName: e.target.value })
                    }
                  />
                </FieldShell>
                <FieldShell label="Suffix (optional)" htmlFor={`member-${entry.id}-suffix`}>
                  <Input
                    id={`member-${entry.id}-suffix`}
                    value={entry.suffix ?? ""}
                    onChange={(e) => update(entry.id, { suffix: e.target.value })}
                    placeholder="Jr, Sr, III…"
                  />
                </FieldShell>
              </div>
            ) : (
              <FieldShell
                label="Entity name"
                required
                className="md:col-span-2"
                htmlFor={`member-${entry.id}-entity-name`}
                error={rowError(idx, "entityName")}
              >
                <Input
                  id={`member-${entry.id}-entity-name`}
                  aria-invalid={!!rowError(idx, "entityName")}
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
            errors={rowError(idx, "address1") ? { address1: rowError(idx, "address1") } : undefined}
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

