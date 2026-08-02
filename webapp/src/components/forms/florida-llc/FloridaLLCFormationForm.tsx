import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { defaultFormData } from "./defaults";
import { validateStep } from "./stepValidation";
import { buildPayload, flattenForFormspree } from "./buildPayload";
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
import { StepFilingPath } from "./sections/StepFilingPath";
import { STEPS, stepIndexOf } from "./steps";
import type { FloridaLLCFormData } from "./types";

const STORAGE_KEY = "fl-llc-formation-draft-v1";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/xjgdeppp";

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
      setErrors(validateStep(stepKey, data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const patch = (p: Partial<FloridaLLCFormData>) =>
    setData((d) => ({ ...d, ...p }));

  const goNext = () => {
    const e = validateStep(stepKey, data);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = document.querySelector<HTMLElement>("[aria-invalid='true']");
      first?.focus?.();
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors({});
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
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
    for (let i = 0; i < STEPS.length - 1; i++) {
      const e = validateStep(STEPS[i].key, data);
      if (Object.keys(e).length > 0) {
        setStepIndex(i);
        setErrors(e);
        toast({
          title: "Please fix the highlighted fields before submitting.",
          description: `Step "${STEPS[i].label}" needs attention.`,
        });
        return;
      }
    }

    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = buildPayload(data);
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          _subject: `New intake — ${payload.llcName.finalName || payload.llcName.desiredName || "Unnamed LLC"}`,
          email: payload.correspondence.email,
          ...flattenForFormspree(payload),
        }),
      });
      if (!res.ok) {
        throw new Error(`Form submission failed (${res.status})`);
      }
      setSubmitted(true);
      setStepIndex(STEPS.length - 1);
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

  const stepKey = STEPS[stepIndex].key;

  const progressPct = useMemo(
    () => Math.round(((stepIndex + 1) / STEPS.length) * 100),
    [stepIndex],
  );

  const isReview = stepKey === "review";
  const isCertify = stepKey === "certify";
  const isSubmit = stepKey === "submit";
  const isLastBeforeReview = stepKey === "optional";

  return (
    <div className="container-wide pb-12 lg:pb-16">
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
                Step {stepIndex + 1} of {STEPS.length}
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
            {STEPS.map(({ key, label }, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <li key={key}>
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
              isConversion={data.filingPath === "CONVERT"}
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
            {stepKey === "path" ? (
              <StepFilingPath data={data} patch={patch} errors={errors} />
            ) : stepKey === "intro" ? (
              <StepIntro data={data} patch={patch} errors={errors} />
            ) : stepKey === "name" ? (
              <StepName data={data} patch={patch} errors={errors} />
            ) : stepKey === "principal" ? (
              <StepPrincipalAddress data={data} patch={patch} errors={errors} />
            ) : stepKey === "mailing" ? (
              <StepMailingAddress data={data} patch={patch} errors={errors} />
            ) : stepKey === "series" ? (
              <StepSeries data={data} patch={patch} errors={errors} />
            ) : stepKey === "agent" ? (
              <StepRegisteredAgent data={data} patch={patch} errors={errors} />
            ) : stepKey === "acceptance" ? (
              <StepRegisteredAgentAcceptance
                data={data}
                patch={patch}
                errors={errors}
              />
            ) : stepKey === "management" ? (
              <StepManagement data={data} patch={patch} errors={errors} />
            ) : stepKey === "managers" ? (
              <StepManagers data={data} patch={patch} errors={errors} />
            ) : stepKey === "members" ? (
              <StepMembers data={data} patch={patch} errors={errors} />
            ) : stepKey === "purpose" ? (
              <StepPurpose data={data} patch={patch} errors={errors} />
            ) : stepKey === "effective" ? (
              <StepEffectiveDate data={data} patch={patch} errors={errors} />
            ) : stepKey === "correspondence" ? (
              <StepCorrespondence data={data} patch={patch} errors={errors} />
            ) : stepKey === "optional" ? (
              <StepOptionalDocs data={data} patch={patch} />
            ) : isReview ? (
              <ReviewStep data={data} goToStep={(k) => goToStep(stepIndexOf(k))} />
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
                    {isLastBeforeReview ? "Continue to review" : "Continue"}
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
              <strong className="text-trust">Submission received.</strong>{" "}
              Our team will prepare your documents for filing with the Florida
              Division of Corporations.
            </div>
          ) : null}

          <p className="mt-6 text-xs text-muted-foreground leading-relaxed">
            <strong>Disclaimer:</strong> This service prepares documents based
            on information you provide. We are not a law firm and do not provide
            legal, tax, or accounting advice. Your use of this form does not
            create an attorney–client relationship.
          </p>
        </main>
      </div>
    </div>
  );
}
