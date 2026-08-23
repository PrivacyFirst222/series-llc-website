import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { defaultFormData } from "./defaults";
import { validateStep } from "./stepValidation";
import { api, ApiError } from "@/lib/api";
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
import { STEPS, stepIndexOf, stepForField } from "./steps";
import type { FloridaLLCFormData } from "./types";

const STORAGE_KEY = "fl-llc-formation-draft-v1";


interface FormProps {
  initialData?: FloridaLLCFormData;
  onSubmit?: (data: FloridaLLCFormData) => void;
}

interface StoredDraft {
  __draft: 2;
  data: FloridaLLCFormData;
  stepIndex: number;
  maxStep: number;
  /** Steps the customer has actually opened. Added when navigation became free;
   *  absent in older drafts, where reaching a step required walking to it. */
  visited?: number[];
}

function loadDraft(initialData?: FloridaLLCFormData): {
  data: FloridaLLCFormData;
  step: number;
  max: number;
  visited: number[];
} {
  const upTo = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
  if (initialData) return { data: initialData, step: 0, max: 0, visited: [0] };
  // Refreshing must never lose the customer's place: the draft stores both
  // the answers and how far they had gotten.
  const lastResumable = STEPS.length - 2; // never restore onto the submit screen
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredDraft | FloridaLLCFormData;
      if (parsed && (parsed as StoredDraft).__draft === 2) {
        const d = parsed as StoredDraft;
        const max = Math.min(d.maxStep ?? 0, lastResumable);
        return {
          data: { ...defaultFormData, ...d.data },
          step: Math.min(d.stepIndex ?? 0, max),
          max,
          visited: d.visited ?? upTo(max),
        };
      }
      // Older drafts stored the answers alone — recover the customer's
      // position by walking forward through steps their answers satisfy.
      const merged = { ...defaultFormData, ...(parsed as FloridaLLCFormData) };
      let max = 0;
      for (let i = 0; i < lastResumable; i++) {
        if (Object.keys(validateStep(STEPS[i].key, merged)).length > 0) break;
        max = i + 1;
      }
      return { data: merged, step: max, max, visited: upTo(max) };
    }
  } catch {
    // ignore
  }
  return { data: defaultFormData, step: 0, max: 0, visited: [0] };
}

export function FloridaLLCFormationForm({
  initialData,
  onSubmit,
}: FormProps) {
  const [data, setData] = useState<FloridaLLCFormData>(() => loadDraft(initialData).data);
  const [stepIndex, setStepIndex] = useState<number>(() => loadDraft(initialData).step);
  const [maxStep, setMaxStep] = useState<number>(() => loadDraft(initialData).max);
  // A tick means "you have seen this step and nothing on it is outstanding".
  // Completeness alone is not enough: several steps validate at their defaults,
  // so ticking those would claim a question was answered that was never shown.
  const [visited, setVisited] = useState<Set<number>>(
    () => new Set(loadDraft(initialData).visited),
  );
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // A draft can be parked on a step that later became hidden (management
  // switched to member-managed, or the rule shipped after the draft was
  // saved) — move off it rather than render a step that no longer exists.
  useEffect(() => {
    if (stepHidden(stepIndex)) {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, data.managementStructure]);

  // Auto-save draft (answers + position)
  useEffect(() => {
    try {
      const draft: StoredDraft = {
        __draft: 2,
        data,
        stepIndex,
        maxStep,
        visited: [...visited],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore quota
    }
  }, [data, stepIndex, maxStep, visited]);

  // Whatever step is on screen counts as seen.
  useEffect(() => {
    setVisited((prev) => (prev.has(stepIndex) ? prev : new Set(prev).add(stepIndex)));
  }, [stepIndex]);

  // Re-run validation for the current step on data changes (after first attempt)
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      setErrors(validateStep(stepKey, data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const patch = (p: Partial<FloridaLLCFormData>) =>
    setData((d) => ({ ...d, ...p }));

  // Soft USPS check state: which step has an unresolved warning. Continuing a
  // second time proceeds — the check advises, it never blocks.
  const [addressWarning, setAddressWarning] = useState<{
    step: string;
    message: string;
    suggested?: { street: string; unit: string; city: string; state: string; zip: string };
  } | null>(null);
  const [checkingAddress, setCheckingAddress] = useState<boolean>(false);

  /** USPS returns one street line ("301 N Fern Creek Ave Ste C"); the form
   *  keeps street and suite apart. Split on the Postal Service's own
   *  secondary-unit designators — a closed list, unlike human names — and
   *  when none is present the whole line is the street and the suite field
   *  is cleared (the line already contains everything USPS wants). */
  const splitUspsLine = (line: string): { street: string; unit: string } => {
    const DESIGNATORS = ["APT","BLDG","DEPT","FL","FRNT","HNGR","KEY","LBBY","LOT","LOWR","OFC","PH","PIER","REAR","RM","SIDE","SLIP","SPC","STOP","STE","SUITE","TRLR","UNIT","UPPR","#"];
    const words = line.trim().split(/\s+/);
    for (let i = words.length - 2; i > 0; i--) {
      if (DESIGNATORS.includes(words[i].toUpperCase().replace(/\./g, ""))) {
        return { street: words.slice(0, i).join(" "), unit: words.slice(i).join(" ") };
      }
    }
    return { street: line.trim(), unit: "" };
  };

  const addressToVerify = (): { address1: string; address2?: string; city: string; state: string; zip: string } | null => {
    if (stepKey === "principal") {
      const a = data.principalAddress;
      if (a.state !== "FL" && a.state.length !== 2) return null;
      return { address1: a.address1, address2: a.address2, city: a.city, state: a.state, zip: a.zip };
    }
    if (stepKey === "mailing" && !data.mailingSameAsPrincipal) {
      const a = data.mailingAddress;
      if (a.state.length !== 2) return null;
      return { address1: a.address1, address2: a.address2, city: a.city, state: a.state, zip: a.zip };
    }
    if (stepKey === "agent" && data.registeredAgentChoice === "SELF") {
      return {
        address1: data.registeredAgentStreetAddress1,
        address2: data.registeredAgentStreetAddress2,
        city: data.registeredAgentCity,
        state: "FL",
        zip: data.registeredAgentZip,
      };
    }
    return null;
  };

  const useSuggestedAddress = () => {
    const s = addressWarning?.suggested;
    if (!s) return;
    if (stepKey === "principal") {
      patch({ principalAddress: { ...data.principalAddress, address1: s.street, address2: s.unit, city: s.city, state: s.state, zip: s.zip } });
    } else if (stepKey === "mailing") {
      patch({ mailingAddress: { ...data.mailingAddress, address1: s.street, address2: s.unit, city: s.city, state: s.state, zip: s.zip } });
    } else if (stepKey === "agent") {
      patch({
        registeredAgentStreetAddress1: s.street,
        registeredAgentStreetAddress2: s.unit,
        registeredAgentCity: s.city,
        registeredAgentZip: s.zip,
      });
    }
    // The fields update in place so the client can see what was written;
    // they continue when they're ready.
    setAddressWarning(null);
  };

  // Member-managed companies never see the managers step: the members are
  // listed automatically (AMBR) and there is nothing to ask.
  const stepHidden = (i: number): boolean =>
    STEPS[i]?.key === "managers" && data.managementStructure === "MEMBER_MANAGED";

  const advance = () => {
    setErrors({});
    setAddressWarning(null);
    setStepIndex((i) => {
      let next = Math.min(i + 1, STEPS.length - 1);
      while (stepHidden(next) && next < STEPS.length - 1) next++;
      setMaxStep((m) => Math.max(m, next));
      return next;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goNext = async () => {
    const e = validateStep(stepKey, data);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = document.querySelector<HTMLElement>("[aria-invalid='true']");
      first?.focus?.();
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Second click after a warning: the customer has confirmed their address.
    if (addressWarning?.step === stepKey) {
      advance();
      return;
    }

    const candidate = addressToVerify();
    if (candidate && !checkingAddress) {
      setCheckingAddress(true);
      try {
        const result = await api.post<{
          status: string;
          normalized: { address1: string; city: string; state: string; zip: string } | null;
        }>("/api/address/verify", candidate);

        // Compare every part, not just the street line: a corrected ZIP or
        // city matters just as much on a filing.
        const norm = (s: string) => s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
        const enteredStreet = [candidate.address1, candidate.address2].filter(Boolean).join(" ");
        const corrected =
          result.normalized &&
          (norm(result.normalized.address1) !== norm(enteredStreet) ||
            norm(result.normalized.city) !== norm(candidate.city) ||
            norm(result.normalized.state) !== norm(candidate.state) ||
            norm(result.normalized.zip) !== norm(candidate.zip))
            ? `${result.normalized.address1}, ${result.normalized.city}, ${result.normalized.state} ${result.normalized.zip}`
            : "";

        if (result.status === "unverified") {
          setAddressWarning({
            step: stepKey,
            message:
              "The Postal Service doesn't recognize this address. Please double-check the street number, spelling, city, and ZIP — or press Continue again to use it exactly as entered.",
          });
          return;
        }
        if (result.status === "missing_unit") {
          setAddressWarning({
            step: stepKey,
            message:
              "This building requires a suite or unit number — mail sent without one may not be delivered. Add it above, or press Continue again to use the address exactly as entered.",
          });
          return;
        }
        if (result.status === "invalid_unit") {
          setAddressWarning({
            step: stepKey,
            message:
              "The Postal Service doesn't recognize that suite or unit number at this building. Please check it — or press Continue again to use the address exactly as entered.",
          });
          return;
        }
        if (corrected && result.normalized) {
          const { street, unit } = splitUspsLine(result.normalized.address1);
          setAddressWarning({
            step: stepKey,
            message: `The Postal Service lists this address as: ${corrected}.`,
            suggested: {
              street,
              unit,
              city: result.normalized.city,
              state: result.normalized.state,
              zip: result.normalized.zip,
            },
          });
          return;
        }
      } catch {
        // Verification is best-effort; never hold up the form.
      } finally {
        setCheckingAddress(false);
      }
    }
    advance();
  };

  const goBack = () => {
    setErrors({});
    setAddressWarning(null);
    setStepIndex((i) => {
      let prev = Math.max(i - 1, 0);
      while (stepHidden(prev) && prev > 0) prev--;
      return prev;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToStep = (i: number) => {
    setErrors({});
    setAddressWarning(null);
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
      // The server re-validates everything and recomputes the price; it returns
      // a Square-hosted checkout page to finish on. The local draft survives
      // until payment is confirmed, in case the customer backs out of checkout.
      const { checkoutUrl } = await api.post<{ orderId: string; checkoutUrl: string }>(
        "/api/orders",
        data,
      );
      onSubmit?.(data);
      window.location.assign(checkoutUrl);
    } catch (err) {
      // Until online ordering is enabled in production, fall back to the
      // legacy Formspree intake so no submission is ever lost.
      if (err instanceof ApiError && err.status === 503) {
        await submitViaFormspree();
        return;
      }
      console.error("Intake submission failed:", err);
      const issues = (err instanceof ApiError
        ? (err.data as { issues?: { path?: (string | number)[]; message?: string }[] } | undefined)?.issues
        : undefined) ?? [];
      if (issues.length > 0) {
        // Send the customer to the screen that owns the first flagged field,
        // with the messages attached to the fields themselves.
        const fieldErrors: Record<string, string> = {};
        for (const issue of issues) {
          const key = (issue.path ?? []).join(".");
          if (key && !fieldErrors[key]) fieldErrors[key] = issue.message ?? "Please review this field.";
        }
        const firstField = String(issues[0]?.path?.[0] ?? "");
        const target = stepIndexOf(stepForField(firstField));
        if (target >= 0) {
          setStepIndex(target);
          setMaxStep((m) => Math.max(m, target));
        }
        setErrors(fieldErrors);
        window.scrollTo({ top: 0, behavior: "smooth" });
        toast({
          title: "Almost there — one of your answers needs attention.",
          description: `We've taken you to the "${STEPS[target >= 0 ? target : 0].label}" step and highlighted what to fix.`,
        });
      } else {
        toast({
          title: "We couldn't submit your form.",
          description:
            err instanceof ApiError && err.message
              ? `${err.message} Your draft is saved on this device.`
              : "Please check your connection and try again. Your draft is saved on this device.",
        });
      }
      setSubmitting(false);
    }
  };

  const submitViaFormspree = async () => {
    try {
      const payload = buildPayload(data);
      const res = await fetch("https://formspree.io/f/xjgdeppp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: `New intake — ${payload.llcName.finalName || payload.llcName.desiredName || "Unnamed LLC"}`,
          email: payload.correspondence.email,
          ...flattenForFormspree(payload),
        }),
      });
      if (!res.ok) throw new Error(`Form submission failed (${res.status})`);
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
                Step {STEPS.slice(0, stepIndex + 1).filter((_, i) => !stepHidden(i)).length} of{" "}
                {STEPS.filter((_, i) => !stepHidden(i)).length}
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
              if (stepHidden(i)) return null;
              const displayNumber = STEPS.slice(0, i + 1).filter((_, j) => !stepHidden(j)).length;
              // Every step is reachable at any time, in any order. A tick means
              // the customer has BEEN here and nothing on the step is
              // outstanding — never completeness alone, which would tick steps
              // that validate at their defaults and were never opened.
              //
              // The last entry is the exception: it is the confirmation screen
              // shown after filing, not a step to fill in. Reaching it by
              // clicking would show a completed filing that never happened.
              const isConfirmation = i === STEPS.length - 1;
              const reachable = !isConfirmation || stepIndex === i;
              const done =
                !isConfirmation &&
                visited.has(i) &&
                Object.keys(validateStep(key, data)).length === 0;
              const active = i === stepIndex;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => reachable && goToStep(i)}
                    className={`w-full flex items-center gap-2 text-left rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-trust/10 text-foreground font-medium"
                        : reachable
                          ? "text-foreground/80 hover:bg-secondary"
                          : "text-muted-foreground cursor-not-allowed"
                    }`}
                    disabled={!reachable}
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
                      {done ? <Check className="h-3 w-3" /> : displayNumber}
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

            {addressWarning?.step === stepKey ? (
              <div className="mt-6 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
                {addressWarning.message}
                {addressWarning.suggested ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      onClick={useSuggestedAddress}
                      className="rounded-full"
                    >
                      Use this address
                    </Button>
                  </div>
                ) : null}
              </div>
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
                    disabled={checkingAddress}
                    className={`rounded-full ${
                      isLastBeforeReview
                        ? "bg-accent text-accent-foreground hover:bg-accent/90"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {checkingAddress
                      ? "Checking address…"
                      : addressWarning?.step === stepKey
                        ? "Continue anyway"
                        : isLastBeforeReview
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
