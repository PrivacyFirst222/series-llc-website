import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { clearAllDrafts } from "./drafts";

/** Shown when the admin is looking at a client's portal as the client
 *  (Adam, 9 Sep 2026). Everything done here happens as the client, so the
 *  banner says so; Exit ends the view and returns to the admin. */
export function ViewingAsBanner() {
  const me = useQuery({
    queryKey: ["portal-me"],
    queryFn: () => api.get<{ email: string; name: string; viewingAsAdmin?: boolean }>("/api/auth/me"),
    retry: false,
  });
  if (!me.data?.viewingAsAdmin) return null;
  const exit = async () => {
    await api.post("/api/auth/logout", {}).catch(() => undefined);
    clearAllDrafts();
    window.location.assign("/admin");
  };
  return (
    <div
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-200"
      role="status"
      data-testid="viewing-as-banner"
    >
      <span className="inline-flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          You are viewing this portal as <strong>{me.data.name || me.data.email}</strong> ({me.data.email}) from the admin.
          Anything you do here happens as the client.
        </span>
      </span>
      <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={exit}>
        Exit
      </Button>
    </div>
  );
}
