import { Pencil, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeeEstimate } from "./FeeEstimate";
import { ServiceFeeEstimate } from "./ServiceFeeEstimate";
import { buildFinalLlcName } from "./validation";
import type { StepKey } from "./steps";
import type {
  AddressFields as AddressType,
  FloridaLLCFormData,
} from "./types";

interface ReviewStepProps {
  data: FloridaLLCFormData;
  goToStep: (key: StepKey) => void;
}

const fmtAddr = (a: AddressType | undefined): React.ReactNode => {
  if (!a || !a.address1) return "—";
  return (
    <span>
      <span className="block">{a.address1}</span>
      {a.address2 ? <span className="block">{a.address2}</span> : null}
      <span className="block">{`${a.city}, ${a.state} ${a.zip} (${a.country})`}</span>
    </span>
  );
};

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);

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
        <ReviewCard title="Your Information" onEdit={() => goToStep("client")}>
          <Row
            label="Name"
            value={[data.clientFirstName, data.clientLastName].filter(Boolean).join(" ")}
          />
          <Row label="Email" value={data.clientEmail} />
          <Row label="Phone" value={data.clientPhone} />
          <Row label="Address" value={fmtAddr(data.clientAddress)} />
        </ReviewCard>

        <ReviewCard title="LLC Name" onEdit={() => goToStep("name")}>
          <Row
            label="Formation type"
            value={
              `Florida Series ${data.formationType === "PLLC" ? "PLLC" : "LLC"} with ${countWord(data.series.length)} series`
            }
          />
          <Row label="Final name" value={finalName} />
          <Row label="Designator" value={data.llcDesignator} />
          <Row label="Alt #1" value={data.alternateName1} />
          <Row label="Alt #2" value={data.alternateName2} />
        </ReviewCard>

        <ReviewCard title="Principal Office Address" onEdit={() => goToStep("principal")}>
          <Row label="Address" value={fmtAddr(data.principalAddress)} />
        </ReviewCard>

        <ReviewCard title="Mailing Address" onEdit={() => goToStep("mailing")}>
          <Row label="Same as principal?" value={data.mailingSameAsPrincipal ? "Yes" : "No"} />
          <Row label="Address" value={fmtAddr(mailing)} />
        </ReviewCard>

        <ReviewCard title="Registered Agent" onEdit={() => goToStep("agent")}>
          <Row label="Type" value={data.registeredAgentType} />
          <Row
            label="Name"
            value={
              data.registeredAgentType === "INDIVIDUAL"
                ? [data.registeredAgentFirstName, data.registeredAgentLastName].filter(Boolean).join(" ")
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

        <ReviewCard title="Registered Agent Acceptance" onEdit={() => goToStep("acceptance")}>
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

        <ReviewCard title="Management" onEdit={() => goToStep("management")}>
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
                        ? `${m.role}: ${[m.firstName, m.lastName].filter(Boolean).join(" ")}`
                        : `${m.role}: ${m.businessEntityName}`,
                    )
                    .join("; ")
            }
          />
        </ReviewCard>

        {/* Manager-managed: the members step never ran — ownership is
            collected in the operating agreement questionnaire. */}
        {data.managementStructure !== "MANAGER_MANAGED" ? (
        <ReviewCard title="Members / Ownership" onEdit={() => goToStep("members")}>
          <Row
            label="In Articles?"
            value={data.includeMembersInArticles ? "Yes" : "No"}
          />
          <Row
            label="Initial members"
            value={
              data.members.length === 0
                ? "None"
                : data.members
                    .map((m) => {
                      const name =
                        m.memberType === "INDIVIDUAL"
                          ? [m.firstName, m.lastName].filter(Boolean).join(" ")
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
        ) : null}

        <ReviewCard title="Business Purpose" onEdit={() => goToStep("purpose")}>
          <Row label="Type" value={data.purposeType} />
          <Row label="Description" value={data.businessPurposeText} />
        </ReviewCard>

        <ReviewCard title="Effective Date" onEdit={() => goToStep("effective")}>
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

        <ReviewCard title="Correspondence" onEdit={() => goToStep("correspondence")}>
          <Row label="Name" value={data.correspondentName} />
          <Row label="Company" value={data.correspondentCompany} />
          <Row label="Email" value={data.correspondentEmail} />
          <Row label="Phone" value={data.correspondentPhone} />
          {data.correspondentAddress ? (
            <Row label="Address" value={fmtAddr(data.correspondentAddress)} />
          ) : null}
        </ReviewCard>

        <ReviewCard title="Optional Documents" onEdit={() => goToStep("optional")}>
          <Row
            label="Cert of Status"
            value={data.orderCertificateOfStatus ? "Yes (+$5)" : "No"}
          />
          <Row
            label="Certified Copy"
            value={data.orderCertifiedCopy ? "Yes (+$30)" : "No"}
          />
        </ReviewCard>

        <ReviewCard title="Protected Series" onEdit={() => goToStep("series")}>
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
          <Row
            label="Ownership"
            value={
              data.seriesOwnershipAcknowledgment
                ? "Every series owned by the LLC — acknowledged"
                : "Not acknowledged"
            }
          />
        </ReviewCard>

        <ReviewCard title="Signing the Articles" onEdit={() => goToStep("certify")}>
          <Row
            label="Signed by"
            value={
              data.articlesSignerChoice === "SERVICE"
                ? "MyFloridaSeriesLLC, as your appointed authorized representative"
                : data.authorizedRepresentativeName || "You (name not yet entered)"
            }
          />
          {data.articlesSignerChoice === "SERVICE" ? (
            <Row
              label="Appointment"
              value={
                data.articlesSignerAppointment
                  ? "Appointed — your name stays off the filed Articles"
                  : "Not yet appointed"
              }
            />
          ) : null}
        </ReviewCard>
      </div>

      <ServiceFeeEstimate
        seriesCount={data.series.length}
        certificateOfStatus={data.orderCertificateOfStatus}
        certifiedCopy={data.orderCertifiedCopy}
        ein={data.orderEin === true}
        sElection={data.orderSElection === true}
        isConversion={data.filingPath === "CONVERT"}
      />

      <FeeEstimate
        isConversion={data.filingPath === "CONVERT"}
        certificateOfStatus={data.orderCertificateOfStatus}
        certifiedCopy={data.orderCertifiedCopy}
        seriesCount={data.series.length}
      />
    </div>
  );
}
