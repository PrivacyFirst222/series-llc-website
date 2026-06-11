import { useMemo, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPayload } from "../buildPayload";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
}

export function StepSubmissionPayload({ data }: StepProps) {
  const payload = useMemo(() => buildPayload(data), [data]);
  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const [copied, setCopied] = useState<boolean>(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `florida-llc-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Submission summary</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Below is the structured JSON payload generated from your inputs.
          This is the data that would be sent to your filing pipeline (no
          actual filing has been made).
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={copy}
          className="rounded-full"
        >
          {copied ? (
            <Check className="mr-1.5 h-4 w-4" />
          ) : (
            <Copy className="mr-1.5 h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy JSON"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={download}
          className="rounded-full"
        >
          <Download className="mr-1.5 h-4 w-4" />
          Download .json
        </Button>
      </div>

      <pre className="overflow-x-auto rounded-2xl border border-border bg-secondary/40 p-4 text-xs leading-relaxed font-mono-feature max-h-[520px]">
        {json}
      </pre>

      <div className="rounded-xl border border-trust/30 bg-trust/5 p-4 text-sm text-foreground/85">
        <strong>Next steps (placeholder):</strong> A real submission would now
        be queued for internal review, payment collection, and Sunbiz
        preparation. We do not file directly with the State of Florida from
        this form.
      </div>

      {/*
        TODO(integration): POST `payload` to /api/llc/formations to persist the
        submission, charge the customer via Stripe, attach payment receipt,
        and create a CRM record / case in your back office.
      */}
    </div>
  );
}
