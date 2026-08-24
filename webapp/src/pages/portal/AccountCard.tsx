import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Mail, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";

interface AccountCardProps {
  email: string;
  pendingEmail: string | null;
}

export function AccountCard({ email, pendingEmail }: AccountCardProps) {
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["portal-me"] });

  const changePassword = useMutation({
    mutationFn: (b: { currentPassword: string; newPassword: string }) =>
      api.post("/api/portal/account/password", b),
    onSuccess: () => {
      setPasswordOpen(false);
      setDone("Your password was changed. Any other signed-in device was signed out.");
      setError("");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const changeEmail = useMutation({
    mutationFn: (b: { newEmail: string; currentPassword: string }) =>
      api.post<{ pendingEmail: string }>("/api/portal/account/email", b),
    onSuccess: (res) => {
      setEmailOpen(false);
      setDone(`Check ${res.pendingEmail} for a confirmation link. Your address changes only after you confirm it.`);
      setError("");
      refresh();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
        <UserCog className="h-4 w-4 text-trust" />
        <h2 className="font-display text-lg">Account</h2>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Email</div>
            <div className="truncate text-sm font-medium">{email}</div>
            {pendingEmail ? (
              <p className="mt-1 text-xs font-medium text-amber-700">
                Pending change to {pendingEmail} — confirm from the link sent to that address.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                You sign in with this address, and it's where documents and notices go.
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 self-start rounded-full sm:self-auto"
            onClick={() => { setEmailOpen(true); setError(""); setDone(""); }}
          >
            <Mail className="mr-1.5 h-3.5 w-3.5" />
            Change email
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Password</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Changing it signs out every other device.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 self-start rounded-full sm:self-auto"
            onClick={() => { setPasswordOpen(true); setError(""); setDone(""); }}
          >
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
            Change password
          </Button>
        </div>

        {done ? <p className="text-sm text-trust">{done}</p> : null}
      </div>

      {/* Change password */}
      <Dialog open={passwordOpen} onOpenChange={(v) => { setPasswordOpen(v); setError(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change your password</DialogTitle>
            <DialogDescription>
              Enter your current password, then choose a new one of at least 8 characters. Every
              other signed-in device will be signed out.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newPassword = String(fd.get("newPassword") ?? "");
              if (newPassword !== String(fd.get("confirmPassword") ?? "")) {
                setError("The new passwords don't match.");
                return;
              }
              changePassword.mutate({
                currentPassword: String(fd.get("currentPassword") ?? ""),
                newPassword,
              });
            }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Current password</label>
              <Input name="currentPassword" type="password" autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New password</label>
              <Input name="newPassword" type="password" autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Retype new password</label>
              <Input name="confirmPassword" type="password" autoComplete="new-password" />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={changePassword.isPending} className="rounded-full">
                {changePassword.isPending ? "Changing…" : "Change password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change email */}
      <Dialog open={emailOpen} onOpenChange={(v) => { setEmailOpen(v); setError(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change your email address</DialogTitle>
            <DialogDescription>
              We'll send a confirmation link to the new address — your account changes only after
              you click it. Your current address is notified at the same time.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              changeEmail.mutate({
                newEmail: String(fd.get("newEmail") ?? ""),
                currentPassword: String(fd.get("currentPassword") ?? ""),
              });
            }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New email address</label>
              <Input name="newEmail" type="email" autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Your password</label>
              <Input name="currentPassword" type="password" autoComplete="current-password" />
              <p className="text-xs text-muted-foreground">
                Required so an unattended session can't be used to take over the account.
              </p>
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={changeEmail.isPending} className="rounded-full">
                {changeEmail.isPending ? "Sending…" : "Send confirmation link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
