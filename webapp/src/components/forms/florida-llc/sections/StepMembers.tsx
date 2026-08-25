import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RepeatableMemberFields } from "../RepeatableMemberFields";
import type { FloridaLLCFormData, MemberEntry } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepMembers({ data, patch, errors }: StepProps) {
  // The client told us who they are at the start — offer that instead of
  // making them retype it. A blank first member row is replaced, not kept.
  const clientName = [data.clientFirstName, data.clientLastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  const memberName = (m: MemberEntry) =>
    (m.memberType === "ENTITY"
      ? m.entityName
      : [m.firstName, m.lastName].filter(Boolean).join(" ")
    )?.trim() ?? "";
  const clientListed = data.members.some(
    (m) => memberName(m).toLowerCase() === clientName.toLowerCase(),
  );
  const addSelf = () => {
    const me: MemberEntry = {
      id: Math.random().toString(36).slice(2, 10),
      memberType: "INDIVIDUAL",
      firstName: data.clientFirstName.trim(),
      lastName: data.clientLastName.trim(),
      entityName: "",
      address1: data.clientAddress.address1,
      address2: data.clientAddress.address2 ?? "",
      city: data.clientAddress.city,
      state: data.clientAddress.state,
      zip: data.clientAddress.zip,
      country: data.clientAddress.country || "United States",
      email: data.clientEmail,
      phone: data.clientPhone ?? "",
      isInitialMember: true,
    };
    const blankOnly =
      data.members.length === 1 && memberName(data.members[0]) === "" && !data.members[0].address1;
    patch({ members: blankOnly ? [me] : [...data.members, me] });
  };
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Initial members</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          We collect member information for your internal records and operating
          agreement preparation. In a member-managed company, the members are
          also listed in the Articles of Organization; in a manager-managed
          company they are not. You can add, remove, or change owners later
          when you build your operating agreement.
        </p>
      </header>

      {clientName && !clientListed ? (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium">Are you a member?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            One tap copies your name and address from the start of the form.
          </p>
          <Button type="button" size="sm" className="mt-3" onClick={addSelf}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add {clientName} (you) as a member
          </Button>
        </div>
      ) : null}

      {data.members.length > 1 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground/80 leading-relaxed">
          <strong>All members own the LLC itself</strong>, in the percentages
          you agree among yourselves. No member will own a particular protected
          series — the LLC owns every series, as you confirmed on the Series
          step.
        </div>
      ) : null}

      <RepeatableMemberFields
        members={data.members}
        onChange={(next) => patch({ members: next })}
      />

      {errors.members ? (
        <p className="text-xs text-destructive">{errors.members}</p>
      ) : null}
    </div>
  );
}
