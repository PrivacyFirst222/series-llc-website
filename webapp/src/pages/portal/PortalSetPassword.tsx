import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function PortalSetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/set-password", { token, password });
      navigate("/portal");
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Something went wrong. Try the link again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <section className="container-wide section-y">
        <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 text-center lg:p-10">
          <h1 className="display text-3xl">Link missing</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This page only works from the link in your email. If yours has expired,
            request a fresh one below.
          </p>
          <Button asChild className="mt-6 rounded-full">
            <Link to="/portal/forgot">Request a new link</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="container-wide section-y">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 lg:p-10">
        <span className="eyebrow">Client portal</span>
        <h1 className="display mt-3 text-3xl">Choose a password</h1>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full rounded-full" disabled={busy}>
            {busy ? "Saving…" : "Save and sign in"}
          </Button>
        </form>
      </div>
    </section>
  );
}
