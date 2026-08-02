import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function PortalForgot() {
  const [email, setEmail] = useState<string>("");
  const [sent, setSent] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/api/auth/forgot", { email });
    } catch {
      // Same message either way — the endpoint never reveals whether an account exists.
    } finally {
      setSent(true);
      setBusy(false);
    }
  };

  return (
    <section className="container-wide section-y">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 lg:p-10">
        <span className="eyebrow">Client portal</span>
        <h1 className="display mt-3 text-3xl">Reset your password</h1>
        {sent ? (
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            If an account exists for that email address, a reset link is on its way.
            The link is good for one hour — check your spam folder if you don't see it.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the email address you used when you signed up, and we'll send a
              link to choose a new password.
            </p>
            <form onSubmit={submit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" size="lg" className="w-full rounded-full" disabled={busy}>
                {busy ? "Sending…" : "Email me a reset link"}
              </Button>
            </form>
          </>
        )}
        <p className="mt-5 text-center text-sm text-muted-foreground">
          <Link to="/portal/login" className="underline underline-offset-4 hover:text-foreground">
            Back to sign in
          </Link>
        </p>
      </div>
    </section>
  );
}
