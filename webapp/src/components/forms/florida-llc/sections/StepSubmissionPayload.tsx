import { CheckCircle2, Mail } from "lucide-react";
import { buildFinalLlcName } from "../validation";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
}

export function StepSubmissionPayload({ data }: StepProps) {
  const llcName =
    buildFinalLlcName(data.desiredLlcName, data.llcDesignator) || "your LLC";
  const seriesCount = data.series.length;
  const email = data.correspondentEmail?.trim();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Intake received</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Thank you — we have everything we need to get started on {llcName}.
        </p>
      </header>

      <div className="rounded-2xl border border-trust/30 bg-trust/5 p-6 space-y-4">
        <div className="flex items-center gap-2 text-trust">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-display text-lg">What happens next</span>
        </div>
        <ol className="space-y-3 text-sm text-foreground/85">
          <li className="flex gap-3">
            <span className="font-mono-feature text-xs text-trust mt-0.5">01</span>
            <span>
              Our team reviews your intake and prepares your Articles of
              Organization
              {seriesCount > 0 ? (
                <>
                  {" "}
                  and {seriesCount} Protected Series Designation
                  {seriesCount === 1 ? "" : "s"}
                </>
              ) : null}
              .
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono-feature text-xs text-trust mt-0.5">02</span>
            <span>
              We file electronically with the Florida Division of Corporations.
              Processing time is set by the state.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono-feature text-xs text-trust mt-0.5">03</span>
            <span>
              Once the state accepts the filing, we send you the filed documents
              along with your form Operating Agreement, property titling manual,
              ledger forms, and maintenance guide.
            </span>
          </li>
        </ol>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="leading-relaxed">
          We&rsquo;ll be in touch
          {email ? (
            <>
              {" "}
              at <span className="text-foreground">{email}</span>
            </>
          ) : null}
          . Questions in the meantime? Email{" "}
          <a
            href="mailto:support@myfloridaseriesllc.com"
            className="text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
          >
            support@myfloridaseriesllc.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
