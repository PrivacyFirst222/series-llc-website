import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

/** Landing page for the link sent to a client's NEW email address. Clicking
 *  it is what actually moves the account, so the swap happens here. */
export default function PortalVerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return; // StrictMode double-invoke would burn the token
    fired.current = true;
    if (!token) {
      setState("failed");
      setError("This link is missing its confirmation code.");
      return;
    }
    api
      .post<{ email: string }>("/api/auth/verify-email", { token })
      .then((res) => {
        setEmail(res.email);
        setState("done");
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "We could not confirm this address.");
        setState("failed");
      });
  }, [token]);

  return (
    <section className="container-wide section-y">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6">
        <span className="eyebrow">Client portal</span>
        {state === "working" ? (
          <>
            <h1 className="display mt-2 text-2xl">Confirming your address…</h1>
            <p className="mt-2 text-sm text-muted-foreground">One moment.</p>
          </>
        ) : null}

        {state === "done" ? (
          <>
            <div className="mt-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-trust" />
              <h1 className="display text-2xl">Address confirmed</h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account now uses <strong className="text-foreground">{email}</strong>. Sign in
              with that address from now on — it's also where documents and notices will go.
            </p>
            <Button asChild className="mt-5 w-full rounded-full">
              <Link to="/portal">
                Go to your portal
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </>
        ) : null}

        {state === "failed" ? (
          <>
            <div className="mt-2 flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <h1 className="display text-2xl">We couldn't confirm it</h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in and request the change again from the Account section of your portal, or
              email support@myfloridaseriesllc.com.
            </p>
            <Button asChild variant="outline" className="mt-5 w-full rounded-full">
              <Link to="/portal/login">Back to sign in</Link>
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}
