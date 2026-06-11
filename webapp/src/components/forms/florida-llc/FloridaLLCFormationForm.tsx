import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { defaultFormData } from "./defaults";
import { validateStep } from "./stepValidation";
import { buildPayload } from "./buildPayload";
import { api } from "@/lib/api";
import { FeeEstimate } from "./FeeEstimate";
import { ReviewStep } from "./ReviewStep";
import { StepIntro } from "./sections/StepIntro";
import { StepName } from "./sections/StepName";
import { StepPrincipalAddress } from "./sections/StepPrincipalAddress";
import { StepMailingAddress } from "./sections/StepMailingAddress";
import { StepRegisteredAgent } from "./sections/StepRegisteredAgent";
import { StepRegisteredAgentAcceptance } from "./sections/StepRegisteredAgentAcceptance";
import { StepManagement } from "./sections/StepManagement";
import { StepManagers } from "./sections/StepManagers";
import { StepMembers } from "./sections/StepMembers";
import { StepPurpose } from "./sections/StepPurpose";
import { StepEffectiveDate } from "./sections/StepEffectiveDate";
import { StepCorrespondence } from "./sections/StepCorrespondence";
import { StepOptionalDocs } from "./sections/StepOptionalDocs";
import { StepSeries } from "./sections/StepSeries";
import { StepCertification } from "./sections/StepCertification";
import { StepSubmissionPayload } from "./sections/StepSubmissionPayload";
import type { FloridaLLCFormData } from "./types";

const STORAGE_KEY = "fl-llc-formation-draft-v1";

const STEP_LABELS: string[] = [
  "Intro",
  "LLC name",
  "Principal address",
  "Mailing address",
  "Series",
  "Registered agent",
  "Agent acceptance",
  "Management",
  "Managers / AR",
  "Members",
  "Purpose",
  "Effective date",
  "Correspondence",
  "Optional docs",
  "Review",
  "Certify & sign",
  "Submit",
];

interface FormProps {
  initialData?: FloridaLLCFormData;
  onSubmit?: (data: FloridaLLCFormData) => void;
}

export function FloridaLLCFormationForm({
  initialData,
  onSubmit,
}: FormProps) {
  const [data, setData] = useState<FloridaLLCFormData>(() => {
    if (initialData) return initialData;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaultFormData, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    return defaultFormData;
  });
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-save draft
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore quota
    }
  }, [data]);

  // Re-run validation for the current step on data changes (after first attempt)
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      setErrors(validateStep(stepIndex, data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const patch = (p: Partial<FloridaLLCFormData>) =>
    setData((d) => ({ ...d, ...p }));

  const goNext = () => {
    const e = validateStep(stepIndex, data);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = document.querySelector<HTMLElement>("[aria-invalid='true']");
      first?.focus?.();
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors({});
    setStepIndex((i) => Math.min(i + 1, STEP_LABELS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setErrors({});
    setStepIndex((i) => Math.max(i - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToStep = (i: number) => {
    setErrors({});
    setStepIndex(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFinalSubmit = async () => {
    // Validate every step before final submission
    for (let i = 0; i < STEP_LABELS.length - 1; i++) {
      const e = validateStep(i, data);
      if (Object.keys(e).length > 0) {
        setStepIndex(i);
        setErrors(e);
        toast({
          title: "Please fix the highlighted fields before submitting.",
          description: `Step "${STEP_LABELS[i]}" needs attention.`,
        });
        return;
      }
    }

    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = buildPayload(data);
      await api.post<{ ok: boolean }>("/api/intake/submit", payload);
      setSubmitted(true);
      setStepIndex(STEP_LABELS.length - 1);
      onSubmit?.(data);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      toast({
        title: "Submission received",
        description:
          "Your information was sent to the formation team. We'll be in touch shortly.",
      });
    } catch (err) {
      console.error("Intake submission failed:", err);
      toast({
        title: "We couldn't submit your form.",
        description:
          "Please check your connection and try again. Your draft is saved on this device.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAndExit = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      toast({
        title: "Draft saved",
        description:
          "Your progress is saved on this device. Return any time to continue.",
      });
    } catch {
      toast({
        title: "Could not save draft",
        description: "Storage may be unavailable.",
      });
    }
  };

  const progressPct = useMemo(
    () => Math.round(((stepIndex + 1) / STEP_LABELS.length) * 100),
    [stepIndex],
  );

  const isLastBeforeReview = stepIndex === STEP_LABELS.length - 3; // 13: review
  const isReview = stepIndex === STEP_LABELS.length - 3;
  const isCertify = stepIndex === STEP_LABELS.length - 2;
  const isSubmit = stepIndex === STEP_LABELS.length - 1;

  return (
    <div className="container-wide pb-24">
      <div className="grid gap-8 lg:grid-cols-[260px_1fr] mt-8">
        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-trust font-medium">
              Progress
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-3xl">{progressPct}%</span>
              <span className="text-xs text-muted-foreground">
                Step {stepIndex + 1} of {STEP_LABELS.length}
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-accent transition-[width] duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <ol className="hidden lg:block rounded-2xl border border-border bg-card p-3 space-y-1">
            {STEP_LABELS.map((label, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => i <= stepIndex && goToStep(i)}
                    className={`w-full flex items-center gap-2 text-left rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-trust/10 text-foreground font-medium"
                        : done
                          ? "text-foreground/80 hover:bg-secondary"
                          : "text-muted-foreground cursor-not-allowed"
                    }`}
                    disabled={i > stepIndex}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                        done
                          ? "bg-trust text-trust-foreground"
                          : active
                            ? "bg-accent text-accent-foreground"
                            : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>

          {stepIndex >= 4 ? (
            <FeeEstimate
              certificateOfStatus={data.orderCertificateOfStatus}
              certifiedCopy={data.orderCertifiedCopy}
              seriesCount={data.series.length}
              compact
            />
          ) : null}
        </aside>

        {/* Form panel */}
        <main>
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-10">
            {stepIndex === 0 ? (
              <StepIntro data={data} patch={patch} errors={errors} />
            ) : stepIndex === 1 ? (
              <StepName data={data} patch={patch} errors={errors} />
            ) : stepIndex === 2 ? (
              <StepPrincipalAddress data={data} patch={patch} errors={errors} />
            ) : stepIndex === 3 ? (
              <StepMailingAddress data={data} patch={patch} errors={errors} />
            ) : stepIndex === 4 ? (
              <StepSeries data={data} patch={patch} errors={errors} />
            ) : stepIndex === 5 ? (
              <StepRegisteredAgent data={data} patch={patch} errors={errors} />
            ) : stepIndex === 6 ? (
              <StepRegisteredAgentAcceptance
                data={data}
                patch={patch}
                errors={errors}
              />
            ) : stepIndex === 7 ? (
              <StepManagement data={data} patch={patch} errors={errors} />
            ) : stepIndex === 8 ? (
              <StepManagers data={data} patch={patch} errors={errors} />
            ) : stepIndex === 9 ? (
              <StepMembers data={data} patch={patch} errors={errors} />
            ) : stepIndex === 10 ? (
              <StepPurpose data={data} patch={patch} errors={errors} />
            ) : stepIndex === 11 ? (
              <StepEffectiveDate data={data} patch={patch} errors={errors} />
            ) : stepIndex === 12 ? (
              <StepCorrespondence data={data} patch={patch} errors={errors} />
            ) : stepIndex === 13 ? (
              <StepOptionalDocs data={data} patch={patch} />
            ) : isReview ? (
              <ReviewStep data={data} goToStep={goToStep} />
            ) : isCertify ? (
              <StepCertification data={data} patch={patch} errors={errors} />
            ) : isSubmit ? (
              <StepSubmissionPayload data={data} />
            ) : null}

            {/* Nav */}
            {!isSubmit ? (
              <div className="mt-10 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border pt-6">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goBack}
                    disabled={stepIndex === 0}
                    className="rounded-full"
                  >
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSaveAndExit}
                    className="rounded-full text-muted-foreground"
                  >
                    <Save className="mr-1.5 h-4 w-4" />
                    Save & continue later
                  </Button>
                </div>
                {isCertify ? (
                  <Button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={submitting}
                    className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {submitting ? "Submitting…" : "Submit intake"}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={goNext}
                    className={`rounded-full ${
                      isLastBeforeReview
                        ? "bg-accent text-accent-foreground hover:bg-accent/90"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {stepIndex === STEP_LABELS.length - 4
                      ? "Continue to review"
                      : "Continue"}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-10 flex justify-end gap-2 border-t border-border pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => goToStep(0)}
                  className="rounded-full"
                >
                  Start a new filing
                </Button>
              </div>
            )}
          </div>

          {submitted && isSubmit ? (
            <div className="mt-6 rounded-2xl border border-trust/40 bg-trust/5 p-5 text-sm">
              <strong className="text-trust">Payload generated.</strong>{" "}
              Your submission has been recorded for processing. Our team will
              prepare the Articles of Organization for filing with the Florida
              Division of Corporations.
            </div>
          ) : null}

          <p className="mt-6 text-xs text-muted-foreground leading-relaxed">
            <strong>Disclaimer placeholder:</strong> This service prepares
            documents based on information you provide. We are not a law firm
            and do not provide legal, tax, or accounting advice. Your use of
            this form does not create an attorney-client relationship.
          </p>
        </main>
      </div>
    </div>
  );
}
