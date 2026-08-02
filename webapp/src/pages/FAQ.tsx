import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";

const FAQ_ITEMS: { q: string; a: string; link?: { to: string; label: string } }[] = [
  {
    q: "Is Florida's Protected Series LLC statute in effect?",
    a: "Yes. Florida Statute §605.2101 et seq. is in effect, and Articles of Organization for protected series LLCs are being accepted. We prepare and submit your filing as soon as your intake is complete.",
  },
  {
    q: "How is a Protected Series LLC different from a regular LLC?",
    a: "A regular LLC is a single legal entity. A Protected Series LLC is a parent entity that contains an unlimited number of internal 'series,' each shielded like a separate entity for liability purposes without being a separate legal entity. You get the asset segregation of multiple LLCs and only pay one annual fee.",
  },
  {
    q: "Can a protected series hold Florida real estate in its own name?",
    a: "Yes. A protected series is its own person under Florida law with the same property powers as the LLC, and §605.2301 addresses deeds directly: a recorded deed granting an interest in real property to or from a protected series is conclusive of the signer's authority in favor of a person who gives value without knowledge of any lack of authority, and stands as the record that the property is that series' associated asset. Title has to be in the series' own statutory name — a series may not hold property in the LLC's name or another series' name. We can't speak for how a particular clerk's office or title underwriter will handle any given transaction.",
  },
  {
    q: "Do I get separate EINs for each series?",
    a: "Most clients use a single EIN at the parent level with internal accounting that tracks each series. The IRS does, however, permit separate EINs for series that elect to be treated as separate entities for federal tax.",
  },
  {
    q: "How much does it cost to add a new series later?",
    a: "The formation fee covers preparing up to 3 Protected Series Designations. Each additional series is $25 to prepare plus an estimated $25 state filing fee.",
    link: { to: "/pricing", label: "Full pricing and add-ons" },
  },
  {
    q: "Is the liability shield really as strong as a separate LLC?",
    a: "Statutorily, yes — provided you maintain separate books, records, and ledgers for each series, and clearly identify each series in contracts. Florida's statute is modeled on the Uniform Protected Series Act. The recordkeeping is not optional: it is what the shield rests on.",
  },
  {
    q: "Does this work for out-of-state investors?",
    a: "A Florida Protected Series LLC works well for Floridians and for Florida businesses and assets. There is no way to guarantee how the courts of another state — particularly one with no series LLC legislation of its own — will interpret it. If you are not a Floridian, or you plan to transfer out-of-state property into a Florida Protected Series LLC, you should seek advice from an attorney licensed to practice in the relevant state.",
  },
  {
    q: "What's the federal tax treatment?",
    a: "A Florida Protect Series LLC can be taxed as (1) a disregarded entity, (2) a partnership, (3) an S corporation, or (4) C corporation, depending on a number of factors, including whether the LLC is owned by one or more people and what elections you file with the IRS. It is also possible for different series to be taxed differently. What is best for you needs to be discussed with your CPA or other tax professional.",
  },
  {
    q: "How long does formation take?",
    a: "We cannot promise a timeframe. We file promptly once your intake is complete, but from there the processing time belongs to the Florida Secretary of State, which gives no guarantee and offers no expedited service.",
    link: { to: "/how-it-works", label: "How to check current processing dates" },
  },
  {
    q: "Can I cancel or get a refund?",
    a: "We strive to file your LLC formation documents with the Florida Secretary of State within one business day from receiving your order. Oftentimes, it's sooner. If you cancel before the formation documents are filed, we are happy to provide a refund, however, after that, no refunds will be given for any reason.",
  },
];

const FURTHER_READING: { title: string; cite: string; href: string }[] = [
  {
    title: "Florida's New Protected Series LLC Law: Part I",
    cite: "Conti & Teblum, The Florida Bar Journal, Vol. 100, No. 3",
    href: "https://www.floridabar.org/the-florida-bar-journal/floridas-new-protected-series-llc-law-part-i/",
  },
  {
    title: "Florida's New Protected Series LLC Legislation: Part II",
    cite: "Conti & Teblum, The Florida Bar Journal, Vol. 100, No. 4",
    href: "https://www.floridabar.org/the-florida-bar-journal/floridas-new-protected-series-llc-legislation-part-ii/",
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
        description="Drawn from real client questions about Florida's Protected Series LLC statute."
      />

      <section className="container-wide section-pb">
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
                    {item.link ? (
                      <>
                        {" "}
                        <Link
                          to={item.link.to}
                          className="text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
                        >
                          {item.link.label} →
                        </Link>
                      </>
                    ) : null}
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
                    href="https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/0605ContentsIndex.html&StatuteYear=2025&Title=%2D%3E2025%2D%3EChapter%20605"
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

              <span className="mt-6 block font-mono-feature text-xs uppercase tracking-[0.18em] text-trust">
                Further reading
              </span>
              <ul className="mt-3 space-y-3 text-sm">
                {FURTHER_READING.map((a) => (
                  <li key={a.href}>
                    <a
                      href={a.href}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-accent"
                    >
                      {a.title} →
                    </a>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{a.cite}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <CallToAction />
    </>
  );
}
