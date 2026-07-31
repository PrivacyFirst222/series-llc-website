import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import { ClipboardList, FilePlus2, Stamp, Building, Anchor, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const STEPS: {
  n: string;
  icon: typeof ClipboardList;
  title: string;
  body: string;
  duration: string;
}[] = [
  {
    n: "01",
    icon: ClipboardList,
    title: "Discovery & intake",
    body: "Submit your information and goals through our intake form.",
    duration: "Day 0",
  },
  {
    n: "02",
    icon: FilePlus2,
    title: "We draft your filings",
    body: "Custom Articles of Organization, master Operating Agreement, and a Certificate of Designation for each protected series.",
    duration: "Days 1–3",
  },
  {
    n: "03",
    icon: Stamp,
    title: "File with the Florida Division of Corporations",
    body: "We submit electronically under §605.2101, which is now in effect. Your formation date is the day the Division accepts the filing.",
    duration: "Day 4",
  },
  {
    n: "04",
    icon: Building,
    title: "EIN, banking & registered agent",
    body: "We obtain your Federal EIN, set you up with a Florida-based registered agent (us), and provide a banker's package for your master + sub-account structure.",
    duration: "Days 4–6",
  },
  {
    n: "05",
    icon: Anchor,
    title: "Series activation & asset transfers",
    body: "We deliver recording-ready Designations for any series that needs to hold real property — your title agent records them in the proper county.",
    duration: "Day 7+",
  },
  {
    n: "06",
    icon: ShieldCheck,
    title: "Ongoing compliance",
    body: "Annual report (single filing). Optional registered agent renewal. Add a series anytime by filing a Certificate of Designation with the state (estimated $25 filing fee per series).",
    duration: "Annually",
  },
];

export default function HowItWorks() {
  return (
    <>
      <PageHero
        eyebrow="Formation process"
        title={
          <>
            From sign-up to <em>active series</em> in seven days.
          </>
        }
        description="A clean, thorough process designed for portfolios — not paperwork people. Most clients move from intake to filed entity in under a week."
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
                      {step.duration}
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
