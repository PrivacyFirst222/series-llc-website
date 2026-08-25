import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldShell } from "../FieldShell";
import { RepeatablePartyFields } from "../RepeatablePartyFields";
import { fullPersonName } from "../validation";
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

  // Retyping a name here produces a mismatch between the Articles and the
  // operating agreement, so offer every person the form already knows: the
  // client (always), and the members where the members step exists
  // (member-managed intakes reaching here via NOT_SPECIFIED).
  const role = "MGR";
  const listed = new Set(
    data.managers.map((m) =>
      (m.personOrEntity === "ENTITY"
        ? (m.businessEntityName ?? "").trim()
        : fullPersonName(m.firstName, m.lastName, m.suffix)
      ).toLowerCase(),
    ),
  );

  interface Candidate {
    id: string;
    name: string;
    label: string;
    entry: () => PartyEntry;
  }
  const newId = () => Math.random().toString(36).slice(2, 10);

  const clientName = fullPersonName(data.clientFirstName, data.clientLastName, data.clientSuffix);
  const clientCandidate: Candidate | null = clientName
    ? {
        id: "client",
        name: clientName,
        label: `${clientName} (you)`,
        entry: () => ({
          id: newId(),
          role,
          personOrEntity: "INDIVIDUAL",
          firstName: data.clientFirstName.trim(),
          lastName: data.clientLastName.trim(),
          suffix: data.clientSuffix ?? "",
          businessEntityName: "",
          streetAddress1: data.clientAddress.address1,
          streetAddress2: data.clientAddress.address2 ?? "",
          city: data.clientAddress.city,
          state: data.clientAddress.state,
          zip: data.clientAddress.zip,
          country: data.clientAddress.country || "United States",
          phone: data.clientPhone ?? "",
          email: data.clientEmail,
        }),
      }
    : null;

  const memberCandidates: Candidate[] = data.members
    .map((m) => {
      const name =
        m.memberType === "ENTITY"
          ? (m.entityName ?? "").trim()
          : fullPersonName(m.firstName, m.lastName, m.suffix);
      return {
        id: m.id,
        name,
        label: name,
        entry: (): PartyEntry => ({
          id: newId(),
          role,
          personOrEntity: m.memberType,
          firstName: m.memberType === "ENTITY" ? "" : (m.firstName ?? "").trim(),
          lastName: m.memberType === "ENTITY" ? "" : (m.lastName ?? "").trim(),
          suffix: m.memberType === "ENTITY" ? "" : (m.suffix ?? "").trim(),
          businessEntityName: m.memberType === "ENTITY" ? name : "",
          streetAddress1: m.address1,
          streetAddress2: m.address2 ?? "",
          city: m.city,
          state: m.state,
          zip: m.zip,
          country: m.country || "United States",
          phone: m.phone ?? "",
          email: m.email ?? "",
        }),
      };
    })
    .filter((c) => c.name);

  const candidates = [
    ...(clientCandidate ? [clientCandidate] : []),
    // The client may also be a member — never offer the same name twice.
    ...memberCandidates.filter(
      (c) => c.name.toLowerCase() !== clientName.toLowerCase(),
    ),
  ].filter((c) => !listed.has(c.name.toLowerCase()));

  const add = (c: Candidate) => {
    patch({ managers: [...data.managers, c.entry()] });
  };
  // One press: every member not already listed becomes a manager, name and
  // address copied exactly.
  const addAllMembers = () => {
    const fresh = memberCandidates.filter((c) => !listed.has(c.name.toLowerCase()));
    patch({ managers: [...data.managers, ...fresh.map((c) => c.entry())] });
  };
  const hasMemberCandidates = memberCandidates.some(
    (c) => !listed.has(c.name.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Managers</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Add the manager or managers who will run the LLC.
          {required ? (
            <span className="text-foreground"> At least one manager is required because you elected to include a manager-managed statement in the Articles.</span>
          ) : null}
        </p>
      </header>

      {candidates.length > 0 || hasMemberCandidates ? (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium">Add a manager without retyping</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Adding a person here copies their name and address exactly, so your
            operating agreement matches.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hasMemberCandidates ? (
              <Button type="button" size="sm" onClick={addAllMembers}>
                <Users className="mr-2 h-4 w-4" />
                All Members will serve as Managers
              </Button>
            ) : null}
            {candidates.map((c) => (
              <Button
                key={c.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => add(c)}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {c.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <FieldShell label="Managers">
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
