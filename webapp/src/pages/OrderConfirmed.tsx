import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface OrderStatus {
  status: string;
  llcName: string;
  totalCents: number;
}

const DRAFT_KEY = "fl-llc-formation-draft-v1";

export default function OrderConfirmed() {
  const [params] = useSearchParams();
  const ref = params.get("ref") ?? "";
  const isDev = params.get("dev") === "1";

  // Simulate the payment webhook in local dev so the whole flow is walkable.
  useEffect(() => {
    if (isDev && ref) {
      api.post("/api/dev/simulate-payment", { orderId: ref }).catch(() => undefined);
    }
  }, [isDev, ref]);

  const statusQuery = useQuery({
    queryKey: ["order-status", ref],
    queryFn: () => api.get<OrderStatus>(`/api/orders/${ref}/status`),
    enabled: !!ref,
    refetchInterval: (query) => (query.state.data?.status === "paid" ? false : 4000),
  });

  const paid = statusQuery.data?.status === "paid";

  useEffect(() => {
    if (paid) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
    }
  }, [paid]);

  return (
    <section className="container-wide section-y">
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center lg:p-12">
        {paid ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-trust" />
            <h1 className="display mt-5 text-3xl lg:text-4xl">Payment received.</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Thank you{statusQuery.data?.llcName ? ` — we have everything we need to begin on ${statusQuery.data.llcName}` : ""}.
              Check your email: your client portal invitation is on its way, and your
              formation documents will be posted there as they're prepared.
            </p>
            <Button asChild size="lg" className="mt-8 rounded-full">
              <Link to="/portal">Go to your portal</Link>
            </Button>
          </>
        ) : (
          <>
            <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
            <h1 className="display mt-5 text-3xl lg:text-4xl">Finishing up…</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              We're waiting for your payment confirmation. This usually takes a few
              seconds — this page will update on its own.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              If this doesn't resolve within a few minutes, email{" "}
              <a href="mailto:support@myfloridaseriesllc.com" className="underline underline-offset-4">
                support@myfloridaseriesllc.com
              </a>{" "}
              and we'll sort it out.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
