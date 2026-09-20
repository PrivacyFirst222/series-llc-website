import { anticipatedFilingDay, effectiveDateRange, closestEffectiveDate, formatCalendarDate, EFFECTIVE_DATE_NOTICE } from "@/lib/calendar";
import { Input } from "@/components/ui/input";
import { FieldShell } from "../FieldShell";
import {
  shouldRecommendJanuary1Effective,
  validateRequestedDate,
} from "../validation";
import type { EffectiveDateOption, FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepEffectiveDate({ data, patch, errors }: StepProps) {
  const dateError =
    data.effectiveDateOption === "SPECIFIC" && data.requestedEffectiveDate
      ? validateRequestedDate(data.requestedEffectiveDate)
      : data.effectiveDateOption === "SPECIFIC"
        ? "Please select a date."
        : null;

  const filingDay = anticipatedFilingDay();
  const range = effectiveDateRange(filingDay);
  const adjusted = data.effectiveDateOption === "SPECIFIC" && data.requestedEffectiveDate && !dateError
    ? closestEffectiveDate(data.requestedEffectiveDate, filingDay)
    : null;
  const showJan1Tip = shouldRecommendJanuary1Effective();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Effective date</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Choose when the LLC's existence begins. The default is the date the
          Florida Division of Corporations files the Articles. You may set an
          earlier date up to 5 business days back, or a later date up to 90
          days forward.
        </p>
      </header>

      <FieldShell label="Effective date option" required>
        <div className="space-y-2">
          {([
            {
              v: "FILED_BY_DIVISION",
              t: "Date filed by the Division (default)",
            },
            {
              v: "SPECIFIC",
              t: "Choose a specific effective date",
            },
          ] as { v: EffectiveDateOption; t: string }[]).map((o) => (
            <label key={o.v} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="eff-date"
                checked={data.effectiveDateOption === o.v}
                onChange={() => patch({ effectiveDateOption: o.v })}
                className="h-4 w-4 accent-trust"
              />
              {o.t}
            </label>
          ))}
        </div>
      </FieldShell>

      <p className="text-sm text-muted-foreground">{EFFECTIVE_DATE_NOTICE}</p>
      {adjusted && adjusted !== data.requestedEffectiveDate ? <p className="text-sm" role="status">Based on the anticipated filing date, the closest permitted effective date is {formatCalendarDate(adjusted)}.</p> : null}
      {data.effectiveDateOption === "SPECIFIC" ? (
        <FieldShell
          label="Requested effective date"
          required
          htmlFor="requested-effective-date"
          error={dateError ?? errors.requestedEffectiveDate}
          helper={`Anticipated filing: ${formatCalendarDate(filingDay)}. Estimated range: ${formatCalendarDate(range.earliest)} through ${formatCalendarDate(range.latest)}.`}
        >
          <Input
            id="requested-effective-date"
            type="date"
            value={data.requestedEffectiveDate ?? ""}
            onChange={(e) =>
              patch({ requestedEffectiveDate: e.target.value })
            }
          />
        </FieldShell>
      ) : null}

      {showJan1Tip ? (
        <div className="rounded-xl border border-trust/30 bg-trust/5 p-4 text-sm text-foreground/85">
          <strong>Year-end tip:</strong> If the LLC will not transact business
          until the next calendar year, a January 1 effective date may
          postpone the first annual report obligation by one calendar year.
        </div>
      ) : null}
    </div>
  );
}
