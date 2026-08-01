import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import {
  ClipboardList,
  FileText,
  FolderCheck,
  Clock,
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
}[] = [
  {
    n: "01",
    icon: ClipboardList,
    title: "You tell us about your LLC",
    body: "Our online form walks you through what Florida needs: your LLC name, principal and mailing addresses, the protected series you want to create, your registered agent, management structure, members, purpose, and effective date. It saves as you go, so you can stop and come back.",
  },
  {
    n: "02",
    icon: FileText,
    title: "We prepare and file your documents",
    body: "We prepare your Florida Articles of Organization and a Certificate of Designation for each series, then file them electronically with the Division of Corporations.",
  },
  {
    n: "03",
    icon: FolderCheck,
    title: "You get your filed documents and records package",
    body: "Once the state accepts your filing, we send you the filed Articles of Organization and each filed Certificate of Designation, along with a form Operating Agreement to adapt to your own situation, a property titling manual, ledger forms for each series, a maintenance guide, and free access to our iPhone recordkeeping app.",
  },
];

export default function HowItWorks() {
  return (
    <>
      <PageHero
        eyebrow="Formation process"
        title={
          <>
            Three steps to a <em>filed</em> Protected Series LLC.
          </>
        }
        description="You give us your information, we prepare and electronically file your documents with the Florida Division of Corporations, and you receive the filed records."
      />

      <section className="container-wide section-y">
        <div className="grid gap-10 md:grid-cols-3 md:gap-8 lg:gap-12">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.n}>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono-feature text-2xl text-accent">{step.n}</span>
                </div>
                <h3 className="mt-5 font-display text-2xl leading-snug">{step.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 lg:mt-12 hairline" />

        <div className="mt-10 lg:mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-secondary/40 p-6">
            <Clock className="h-5 w-5 text-trust" />
            <h3 className="mt-4 font-display text-lg">About processing times</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We file promptly once your intake is complete, but from there the timing belongs to
              the state. The Florida Division of Corporations does not guarantee how long a filing
              will take and does not offer an expedited service. Check current processing dates at{" "}
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

          <div className="rounded-2xl border border-border bg-secondary/40 p-6">
            <PlusCircle className="h-5 w-5 text-trust" />
            <h3 className="mt-4 font-display text-lg">Optional add-ons</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A Federal EIN is not included in the formation fee, and you can either use our registered
              agent service or serve as your own if you're a Florida resident.{" "}
              <Link
                to="/pricing"
                className="text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
              >
                See pricing for what each costs →
              </Link>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-secondary/40 p-6">
            <CalendarCheck className="h-5 w-5 text-trust" />
            <h3 className="mt-4 font-display text-lg">Ongoing compliance</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              One Florida annual report each year covers the whole structure. Add another protected
              series whenever you need one by filing an additional Certificate of Designation.
              Keeping separate books and records for each series is what preserves the liability
              shield.
            </p>
          </div>
        </div>

        <div className="mt-10 lg:mt-12 text-center">
          <Button asChild size="lg" className="rounded-full px-8 h-12 bg-primary text-primary-foreground">
            <Link to="/pricing">See pricing →</Link>
          </Button>
        </div>
      </section>

      <CallToAction />
    </>
  );
}
