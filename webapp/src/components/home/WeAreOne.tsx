import { FileText, ShieldCheck } from "lucide-react";

const OUR_SERIES = [
  {
    icon: FileText,
    name: "FLORIDA PROTECTED SERIES, LLC - PS 1",
    role: "Filing services",
    sub: "Prepares your documents and filings",
  },
  {
    icon: ShieldCheck,
    name: "FLORIDA PROTECTED SERIES, LLC - PS 2",
    role: "Agent services",
    sub: "Serves as your registered agent",
  },
];

export function WeAreOne() {
  return (
    <section className="relative overflow-hidden bg-secondary/40">
      <div className="container-wide section-y">
        <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="space-y-5 lg:col-span-5">
            <span className="eyebrow">Our own structure</span>
            <h2 className="display text-4xl text-balance lg:text-5xl">
              We don't just form Protected Series LLCs. <em>We are one.</em>
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              This business runs on the exact structure we form for you.{" "}
              <strong className="font-medium text-foreground">FLORIDA PROTECTED SERIES, LLC</strong>{" "}
              is a Florida Protected Series LLC — your documents are prepared by our filing series,{" "}
              <strong className="font-medium text-foreground">- PS 1</strong>, and your registered
              agent is our agent series,{" "}
              <strong className="font-medium text-foreground">- PS 2</strong>. Separate series,
              separate records, separate functions — designated with the Florida Division of
              Corporations and operated the way our own Owner's Manual says to.
            </p>
            <p className="text-base leading-relaxed text-foreground">
              When we tell you the structure works, we're not quoting a brochure. We're describing
              our own company.
            </p>
          </div>

          {/* Our structure diagram */}
          <div className="lg:col-span-7">
            <div className="relative rounded-3xl border border-border bg-card p-6 shadow-sm lg:p-10">
              <div className="flex justify-center pb-2">
                <div className="relative inline-flex flex-col items-center gap-2 rounded-2xl border border-primary/20 bg-primary px-8 py-5 text-primary-foreground">
                  <span className="text-[0.65rem] uppercase tracking-[0.2em] text-primary-foreground/70">
                    The mothership
                  </span>
                  <span className="font-display text-lg lg:text-xl">
                    FLORIDA PROTECTED SERIES, LLC
                  </span>
                  <span className="absolute -bottom-3 left-1/2 h-3 w-px -translate-x-1/2 bg-primary/40" />
                </div>
              </div>

              <div className="mx-auto mt-1 h-6 w-[70%] border-t border-dashed border-primary/30" />

              <div className="grid gap-3 pt-6 sm:grid-cols-2 lg:gap-4">
                {OUR_SERIES.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div
                      key={s.name}
                      className="group rounded-xl border border-border bg-background p-5 transition-all hover:border-accent hover:shadow-md"
                    >
                      <div className="flex items-center gap-2 text-trust">
                        <Icon className="h-4 w-4" />
                        <span className="text-[0.65rem] uppercase tracking-[0.16em]">{s.role}</span>
                      </div>
                      <div className="mt-2 font-display text-sm font-semibold leading-snug text-foreground">
                        {s.name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
                      <div className="mt-3 flex items-center gap-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <span
                            key={i}
                            className="h-1 flex-1 rounded-full bg-trust/20 transition-colors group-hover:bg-trust/60"
                          />
                        ))}
                      </div>
                      <div className="mt-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-trust">
                        Designated · On file with the Division
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                The same architecture we build for clients — filed, designated, and operated under
                Florida's Protected Series Act.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
