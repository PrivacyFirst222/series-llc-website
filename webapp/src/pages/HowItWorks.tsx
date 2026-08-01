import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import {
  ClipboardList,
  FileText,
  Stamp,
  FolderCheck,
  BookOpen,
  PlusCircle,
  CalendarCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const STEPS: {
  n: string;
  icon: typeof ClipboardList;
  title: string;
  body: string;
  actor: string;
}[] = [
  {
    n: "01",
    icon: ClipboardList,
    title: "You complete the intake form",
    body: "Our online form collects the information the state needs: your LLC name, principal and mailing addresses, the series you want to create, your registered agent, management structure, members, purpose, and effective date. Your answers save on your device as you go, so you can stop and come back.",
    actor: "You",
  },
  {
    n: "02",
    icon: FileText,
    title: "We prepare your documents",
    body: "We place your information into Florida's Articles of Organization and prepare a Certificate of Designation for each protected series. We are not a law firm, we do not draft custom documents, and we do not provide legal, tax, or accounting advice.",
    actor: "We prepare",
  },
  {
    n: "03",
    icon: Stamp,
    title: "We file electronically with the state",
    body: "Your Articles of Organization and each Certificate of Designation are submitted electronically to the Florida Division of Corporations. Processing is handled entirely by the state — it sets its own pace, offers no expedited service, and gives no guaranteed turnaround.",
    actor: "We file",
  },
  {
    n: "04",
    icon: FolderCheck,
    title: "You receive your filed documents",
    body: "Once the Division of Corporations accepts the filing, we send you the filed Articles of Organization and each filed Certificate of Designation. You can track the state's current processing dates yourself on Sunbiz at any time.",
    actor: "The state",
  },
  {
    n: "05",
    icon: BookOpen,
    title: "You get your operating agreement and records package",
    body: "You receive a form Operating Agreement to review and adapt to your own situation — it is a template you fill in and modify, not a document we tailor for you. It comes with a property titling manual, ledger forms for each series, a maintenance guide, and free access to our iPhone recordkeeping app.",
    actor: "You",
  },
  {
    n: "06",
    icon: PlusCircle,
    title: "Add what you need",
    body: "A Federal EIN is not included in the formation fee — we can obtain one for the LLC or any series for $50 per EIN. We can also serve as your Florida registered agent, or you can serve as your own if you are a Florida resident with a Florida street address.",
    actor: "Optional",
  },
  {
    n: "07",
    icon: CalendarCheck,
    title: "Ongoing compliance",
    body: "One Florida annual report each year covers the whole structure. Add another protected series whenever you need one by filing an additional Certificate of Designation. Keeping separate books and records for each series is what preserves the liability shield.",
    actor: "Ongoing",
  },
];

export default function HowItWorks() {
  return (
    <>
      <PageHero
        eyebrow="Formation process"
        title={
          <>
            From intake to <em>filed entity</em>, step by step.
          </>
        }
        description="You give us your information, we prepare and electronically file your documents with the Florida Division of Corporations, and you receive the filed records. How long the state takes is up to the state."
      />

      <section className="container-wide section-y">
        <div className="relative">
          {/* Vertical timeline rail */}
          <div className="absolute left-6 lg:left-1/2 top-0 bottom-0 w-px bg-border" aria-hidden />

          <div className="space-y-10">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isEven = i % 2 === 1;
              return (
                <div key={step.n} className="relative grid lg:grid-cols-2 gap-6 lg:gap-12">
                  <div
                    className={`pl-16 lg:pl-0 ${
                      isEven
                        ? "lg:col-start-2 lg:text-left lg:pl-12"
                        : "lg:col-start-1 lg:text-right lg:pr-12"
                    }`}
                  >
                    <span className="font-mono-feature text-xs uppercase tracking-[0.18em] text-trust">
                      {step.actor}
                    </span>
                    <h3 className="mt-2 font-display text-2xl lg:text-3xl">
                      <span className="font-mono-feature text-lg text-accent mr-3">{step.n}</span>
                      {step.title}
                    </h3>
                    <p className="mt-3 text-base text-muted-foreground leading-relaxed max-w-md lg:inline-block lg:text-left">
                      {step.body}
                    </p>
                  </div>

                  {/* Marker */}
                  <div
                    className={`absolute left-6 lg:left-1/2 -translate-x-1/2 top-1 z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 lg:mt-20 rounded-2xl border border-border bg-secondary/40 p-6 lg:p-8">
          <h3 className="font-display text-xl">About processing times</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The Florida Division of Corporations does not guarantee how long a filing will take,
            and it does not offer an expedited filing service. Processing times change with the
            state's workload. We file promptly once your intake is complete, but the time from
            filing to acceptance is outside our control — check the state's current processing
            dates at{" "}
            <a
              href="https://dos.fl.gov/sunbiz/document-processing-dates/"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
            >
              Sunbiz
            </a>
            .
          </p>
        </div>

        <div className="mt-12 lg:mt-20 text-center">
          <Button asChild size="lg" className="rounded-full px-8 h-12 bg-primary text-primary-foreground">
            <Link to="/pricing">See pricing →</Link>
          </Button>
        </div>
      </section>

      <CallToAction />
    </>
  );
}
