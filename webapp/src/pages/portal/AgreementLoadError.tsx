import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function AgreementLoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const expired = error instanceof ApiError && error.status === 401;
  const missing = error instanceof ApiError && (error.data as { code?: string } | undefined)?.code === "NO_LLC";
  return <div role="alert" className="space-y-3">
    <p className="text-sm text-muted-foreground">{expired
      ? "Your sign-in has expired. Please sign in again."
      : missing ? "We couldn't find a paid order for this company."
      : "We couldn't check your agreement just now."}</p>
    {expired ? <Button asChild size="sm" className="rounded-full"><Link to="/portal/login">Sign in again</Link></Button>
      : <Button size="sm" className="rounded-full" onClick={retry}>Try again</Button>}
  </div>;
}
