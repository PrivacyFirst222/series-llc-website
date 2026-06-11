import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "When does Florida's Protected Series LLC statute go into effect?",
    a: "Florida Statute §605.2101 et seq. takes effect on July 1, 2026. Articles of Organization for protected series LLCs may be filed beginning that date. We accept early filings now and submit them on day one.",
  },
  {
    q: "How is a Protected Series LLC different from a regular LLC?",
    a: "A regular LLC is a single legal entity. A Protected Series LLC is a parent entity that contains an unlimited number of internal 'series,' each treated as its own entity for liability purposes. You get the asset segregation of multiple LLCs and only pay one annual fee.",
  },
  {
    q: "Will my Florida county clerk and title insurer recognize series ownership?",
    a: "Yes. Florida Statute §605.2301 explicitly authorizes county clerks to record real property in the name of a protected series. Title insurers in Florida have already prepared underwriting frameworks for series-level title.",
  },
  {
    q: "Do I get separate EINs for each series?",
    a: "Most clients use a single EIN at the parent level with internal accounting that tracks each series. The IRS does, however, permit separate EINs for series that elect to be treated as separate entities for federal tax.",
  },
  {
    q: "How much does it cost to add a new series later?",
    a: "Our $499 base formation fee includes preparing up to 3 Certificates of Designation to form up to 3 series. Additional series cost $25 per Certificate of Designation (drafting) plus an estimated $25 state filing fee per series.",
  },
  {
    q: "Is the liability shield really as strong as a separate LLC?",
    a: "Statutorily, yes — provided you maintain separate books, records, and bank ledgers for each series, and clearly identify each series in contracts. Florida's statute is modeled on the Uniform Protected Series Act, the gold standard for shielding strength.",
  },
  {
    q: "Does this work for out-of-state investors?",
    a: "Absolutely. Out-of-state investors form a Florida Protected Series LLC for Florida-based assets and can foreign-qualify in their home state if needed. The statute's recording-rule benefits attach to Florida real property regardless of where you live.",
  },
  {
    q: "What's the federal tax treatment?",
    a: "A Florida Protect Series LLC can be taxed as (1) a disregarded entity, (2) a partnership, (3) an S corporation, or (4) C corporation, depending on a number of factors, including whether the LLC is owned by one or more people and what elections you file with the IRS. It is also possible for different series to be taxed differently. What is best for you needs to be discussed with your CPA or other tax professional.",
  },
  {
    q: "What's your turnaround time?",
    a: "Typically 7 days from intake to filing, however, the processing time depends on the Florida Secretary of State's workload. This means it can take longer from time to time. You can always check on Sunbiz.org (https://dos.fl.gov/sunbiz/document-processing-dates/) to see what their current processing dates are. Unfortunately, the Florida Secretary of State does not offer an expedited filing service.",
  },
  {
    q: "Can I cancel or get a refund?",
    a: "We strive to file your LLC formation documents with the Florida Secretary of State within one business day from receiving your order. Oftentimes, it's sooner. If you cancel before the formation documents are filed, we are happy to provide a refund, however, after that, no refunds will be given for any reason.",
  },
];

export default function FAQ() {
  return (
    <>
      <PageHero
        eyebrow="Questions, answered"
        title={
          <>
            Everything you might want to ask <em>before</em> you file.
          </>
        }
        description="Drawn from real client questions and the Florida Bar Journal's commentary on §605.2101."
      />

      <section className="container-wide pb-20 lg:pb-28">
        <div className="grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8">
            <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card divide-y divide-border">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="border-0 px-6 [&[data-state=open]]:bg-secondary/40"
                >
                  <AccordionTrigger className="text-left font-display text-base lg:text-lg hover:no-underline py-5">
                    <span className="flex gap-4 items-start">
                      <span className="font-mono-feature text-xs text-accent mt-1.5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{item.q}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground pb-6 pl-10 pr-4">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <aside className="lg:col-span-4 lg:sticky lg:top-24 self-start space-y-6">
            <div className="rounded-2xl bg-secondary/50 border border-border p-6">
              <span className="font-mono-feature text-xs uppercase tracking-[0.18em] text-trust">
                Authoritative sources
              </span>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a
                    href="https://www.flsenate.gov/Laws/Statutes/2024/Chapter605/All"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-accent"
                  >
                    Florida Statute Chapter 605 →
                  </a>
                </li>
                <li>
                  <a
                    href="https://dos.fl.gov/sunbiz/"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-accent"
                  >
                    FL Division of Corporations (Sunbiz) →
                  </a>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <CallToAction />
    </>
  );
}
