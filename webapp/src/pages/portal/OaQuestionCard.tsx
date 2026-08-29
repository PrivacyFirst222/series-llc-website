// The question-card chrome and its Learn More dialog — split from
// OAQuestionnaire.tsx on 29 Aug 2026.
import { useState } from "react";
import type React from "react";
import { HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LEARN_MORE } from "@/content/oaLearnMore";

export function LearnMore({ id }: { id: keyof typeof LEARN_MORE }) {
  const [open, setOpen] = useState(false);
  const screen = LEARN_MORE[id];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-trust underline underline-offset-2"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Learn More
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{screen.title}</DialogTitle>
          </DialogHeader>
          {screen.body}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function QuestionCard({
  title,
  learnMore,
  children,
}: {
  title: string;
  learnMore?: keyof typeof LEARN_MORE;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {learnMore ? <LearnMore id={learnMore} /> : null}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}
