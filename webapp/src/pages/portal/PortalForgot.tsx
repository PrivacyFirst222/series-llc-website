import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

export default function PortalForgot() {
  const [email, setEmail] = useState<string>("");
  const [sent, setSent] = useState<boolean>(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<boolean>(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/forgot", { email });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429
        ? "Too many requests. Try again later."
        : "We could not request a reset link. Check your connection and try again.");
    } finally {
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
              Enter the email address you currently use to sign in, and we'll send a
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
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
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
