import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldShell } from "../FieldShell";
import { RepeatablePartyFields } from "../RepeatablePartyFields";
import type { FloridaLLCFormData, PartyEntry } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepManagers({ data, patch, errors }: StepProps) {
  const required =
    data.managementStructure === "MANAGER_MANAGED" &&
    data.includeManagementStatementInArticles;

  // Managers are nearly always the members themselves. Retyping a name here
  // produces a mismatch between Exhibit A and the signature block of the
  // operating agreement, so offer the members you already entered.
  const memberManaged = data.managementStructure === "MEMBER_MANAGED";
  const role = memberManaged ? "AR" : "MGR";
  const listed = new Set(
    data.managers.map((m) =>
      (m.personOrEntity === "ENTITY"
        ? m.businessEntityName ?? ""
        : [m.firstName, m.lastName].filter(Boolean).join(" ")
      )
        .trim()
        .toLowerCase(),
    ),
  );
  const candidates = data.members
    .map((m) => ({
      member: m,
      name:
        (m.memberType === "ENTITY"
          ? m.entityName
          : [m.firstName, m.lastName].filter(Boolean).join(" ")
        )?.trim() ?? "",
      firstName: (m.firstName ?? "").trim(),
      lastName: (m.lastName ?? "").trim(),
    }))
    .filter((c) => c.name && !listed.has(c.name.toLowerCase()));

  const addMember = (c: (typeof candidates)[number]) => {
    const m = c.member;
    const entry: PartyEntry = {
      id: Math.random().toString(36).slice(2, 10),
      role,
      personOrEntity: m.memberType,
      firstName: m.memberType === "ENTITY" ? "" : c.firstName,
      lastName: m.memberType === "ENTITY" ? "" : c.lastName,
      businessEntityName: m.memberType === "ENTITY" ? c.name : "",
      streetAddress1: m.address1,
      streetAddress2: m.address2 ?? "",
      city: m.city,
      state: m.state,
      zip: m.zip,
      country: m.country || "United States",
      phone: m.phone ?? "",
      email: m.email ?? "",
    };
    patch({ managers: [...data.managers, entry] });
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">
          Managers / Authorized Representatives
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Add managers (MGR) or authorized representatives (AR). Do not list
          members here unless they are actually serving as a manager or AR.
          {required ? (
            <span className="text-foreground"> At least one manager is required because you elected to include a manager-managed statement in the Articles.</span>
          ) : null}
        </p>
      </header>

      {data.managementStructure === "MEMBER_MANAGED" ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Member-Managed LLC — Use Authorized Representative (AR) Title</p>
          <p className="mt-1">
            Because you selected a <strong>member-managed</strong> LLC, any person you list here should be designated as an <strong>Authorized Representative (AR)</strong> — not as a Manager (MGR). In a member-managed LLC, the members themselves run the company, so the "Manager" title is not applicable. Please select <strong>AR</strong> as the role for each person you add below.
          </p>
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium">
            {memberManaged
              ? "Add one of your members as the authorized representative"
              : "Add one of your members as a manager"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {memberManaged
              ? "Most member-managed companies have a member sign as authorized representative."
              : "In most companies the managers are the members. Adding them here copies the name and address exactly, so your operating agreement matches."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {candidates.map((c) => (
              <Button
                key={c.member.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addMember(c)}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {c.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <FieldShell label="Managers / Authorized Representatives">
        <RepeatablePartyFields
          entries={data.managers}
          onChange={(next) => patch({ managers: next })}
        />
      </FieldShell>

      {errors["managers"] ? (
        <p className="text-xs text-destructive">{errors["managers"]}</p>
      ) : null}
    </div>
  );
}
