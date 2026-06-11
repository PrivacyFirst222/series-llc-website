import { Pencil, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeeEstimate } from "./FeeEstimate";
import { buildFinalLlcName } from "./validation";
import type {
  AddressFields as AddressType,
  FloridaLLCFormData,
} from "./types";

interface ReviewStepProps {
  data: FloridaLLCFormData;
  goToStep: (i: number) => void;
}

const fmtAddr = (a: AddressType | undefined): string => {
  if (!a || !a.address1) return "—";
  const line2 = a.address2 ? `, ${a.address2}` : "";
  return `${a.address1}${line2}, ${a.city}, ${a.state} ${a.zip} (${a.country})`;
};

interface CardProps {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}

function ReviewCard({ title, onEdit, children }: CardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-lg">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="text-trust hover:text-trust/80"
        >
          <Pencil className="h-3.5 w-3.5 mr-1" />
          Edit
        </Button>
      </div>
      <div className="mt-3 text-sm text-foreground/85 space-y-1.5">{children}</div>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-2">
    <div className="text-xs uppercase tracking-wider text-muted-foreground col-span-1">
      {label}
    </div>
    <div className="col-span-2">{value || <span className="text-muted-foreground">—</span>}</div>
  </div>
);

export function ReviewStep({ data, goToStep }: ReviewStepProps) {
  const finalName = buildFinalLlcName(data.desiredLlcName, data.llcDesignator);
  const mailing = data.mailingSameAsPrincipal
    ? data.principalAddress
    : data.mailingAddress;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Review your information</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Review carefully. Once submitted to the Florida Division of
          Corporations, Articles of Organization may not be changed, removed,
          canceled, or refunded through this form.
        </p>
      </header>

      <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 flex gap-3 text-amber-900 text-sm">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <ul className="space-y-1 list-disc list-inside">
          <li>Information submitted may become public record.</li>
          <li>
            This service does not provide legal, tax, or accounting advice.
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReviewCard title="LLC Name" onEdit={() => goToStep(1)}>
          <Row
            label="Formation type"
            value={
              data.formationType === "PLLC" ? "Professional LLC (PLLC)" : "Domestic LLC"
            }
          />
          <Row label="Final name" value={finalName} />
          <Row label="Designator" value={data.llcDesignator} />
          <Row label="Alt #1" value={data.alternateName1} />
          <Row label="Alt #2" value={data.alternateName2} />
        </ReviewCard>

        <ReviewCard title="Principal Office Address" onEdit={() => goToStep(2)}>
          <Row label="Address" value={fmtAddr(data.principalAddress)} />
        </ReviewCard>

        <ReviewCard title="Mailing Address" onEdit={() => goToStep(3)}>
          <Row label="Same as principal?" value={data.mailingSameAsPrincipal ? "Yes" : "No"} />
          <Row label="Address" value={fmtAddr(mailing)} />
        </ReviewCard>

        <ReviewCard title="Registered Agent" onEdit={() => goToStep(4)}>
          <Row label="Type" value={data.registeredAgentType} />
          <Row
            label="Name"
            value={
              data.registeredAgentType === "INDIVIDUAL"
                ? data.registeredAgentName
                : data.registeredAgentBusinessEntityName
            }
          />
          <Row
            label="Address"
            value={fmtAddr({
              address1: data.registeredAgentStreetAddress1,
              address2: data.registeredAgentStreetAddress2,
              city: data.registeredAgentCity,
              state: data.registeredAgentState,
              zip: data.registeredAgentZip,
              country: "United States",
            })}
          />
          <Row label="Email" value={data.registeredAgentEmail} />
          <Row label="Phone" value={data.registeredAgentPhone} />
        </ReviewCard>

        <ReviewCard title="Registered Agent Acceptance" onEdit={() => goToStep(5)}>
          <Row label="Acceptance signer" value={data.registeredAgentAcceptanceName} />
          <Row label="Capacity" value={data.registeredAgentAcceptanceCapacity} />
          <Row
            label="Signature"
            value={
              <span className="font-display italic">
                {data.registeredAgentElectronicSignature}
              </span>
            }
          />
        </ReviewCard>

        <ReviewCard title="Management" onEdit={() => goToStep(6)}>
          <Row label="Structure" value={data.managementStructure} />
          <Row
            label="Statement in Articles?"
            value={data.includeManagementStatementInArticles ? "Yes" : "No"}
          />
          <Row
            label="Managers / AR"
            value={
              data.managers.length === 0
                ? "None"
                : data.managers
                    .map((m) =>
                      m.personOrEntity === "INDIVIDUAL"
                        ? `${m.role}: ${m.fullName}`
                        : `${m.role}: ${m.businessEntityName}`,
                    )
                    .join("; ")
            }
          />
        </ReviewCard>

        <ReviewCard title="Members / Ownership" onEdit={() => goToStep(8)}>
          <Row
            label="In Articles?"
            value={data.includeMembersInArticles ? "Yes" : "No"}
          />
          <Row
            label="Members"
            value={
              data.members.length === 0
                ? "None"
                : data.members
                    .map((m) => {
                      const name =
                        m.memberType === "INDIVIDUAL"
                          ? m.fullLegalName
                          : m.entityName;
                      const pct =
                        m.ownershipPercentage !== undefined
                          ? ` (${m.ownershipPercentage}%)`
                          : "";
                      return `${name}${pct}`;
                    })
                    .join("; ")
            }
          />
        </ReviewCard>

        <ReviewCard title="Business Purpose" onEdit={() => goToStep(9)}>
          <Row label="Type" value={data.purposeType} />
          <Row label="Description" value={data.businessPurposeText} />
        </ReviewCard>

        <ReviewCard title="Effective Date" onEdit={() => goToStep(10)}>
          <Row
            label="Option"
            value={
              data.effectiveDateOption === "FILED_BY_DIVISION"
                ? "Date filed by Division"
                : "Specific date"
            }
          />
          {data.effectiveDateOption === "SPECIFIC" ? (
            <Row label="Date" value={data.requestedEffectiveDate} />
          ) : null}
        </ReviewCard>

        <ReviewCard title="Correspondence" onEdit={() => goToStep(11)}>
          <Row label="Name" value={data.correspondentName} />
          <Row label="Company" value={data.correspondentCompany} />
          <Row label="Email" value={data.correspondentEmail} />
          <Row label="Phone" value={data.correspondentPhone} />
          {data.correspondentAddress ? (
            <Row label="Address" value={fmtAddr(data.correspondentAddress)} />
          ) : null}
        </ReviewCard>

        <ReviewCard title="Optional Documents" onEdit={() => goToStep(12)}>
          <Row
            label="Cert of Status"
            value={data.orderCertificateOfStatus ? "Yes (+$5)" : "No"}
          />
          <Row
            label="Certified Copy"
            value={data.orderCertifiedCopy ? "Yes (+$30)" : "No"}
          />
        </ReviewCard>

        <ReviewCard title="Protected Series" onEdit={() => goToStep(13)}>
          <Row
            label="Series count"
            value={`${data.series.length} series`}
          />
          <Row
            label="Series names"
            value={
              data.series.length === 0
                ? "None"
                : data.series.map((s) => s.name).join(", ")
            }
          />
        </ReviewCard>
      </div>

      <FeeEstimate
        certificateOfStatus={data.orderCertificateOfStatus}
        certifiedCopy={data.orderCertifiedCopy}
        seriesCount={data.series.length}
      />
    </div>
  );
}
