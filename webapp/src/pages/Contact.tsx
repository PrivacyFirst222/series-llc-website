import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/sections/PageHero";
import { Send, ShieldCheck, AlertTriangle } from "lucide-react";

interface FormState {
  name: string;
  email: string;
  message: string;
}

const INITIAL: FormState = {
  name: "",
  email: "",
  message: "",
};

export default function Contact() {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name || !form.email) {
      toast({
        duration: Infinity,
        title: "Missing details",
        description: "Please add your name and email so we can reach you.",
      });
      return;
    }
    setSubmitting(true);
    // The acknowledgment is earned, not staged: until 30 Aug 2026 this
    // handler sent nothing anywhere and told the visitor we would reply
    // (P51). Success clears the form only after the server has stored and
    // forwarded the message; failure keeps their text right here.
    api
      .post("/api/contact", { name: form.name, email: form.email, message: form.message })
      .then(() => {
        toast({
          title: "Got it — we'll be in touch!",
          description: "A formation specialist will reply by email within one business day.",
        });
        setForm(INITIAL);
      })
      .catch((err: unknown) => {
        toast({
          duration: Infinity,
          title: "Your message was not sent.",
          description:
            err instanceof ApiError && err.message
              ? err.message
              : "Please try again, or email us directly. Your text is still below.",
        });
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <>
      <PageHero
        eyebrow="Contact Us"
        title={<>Contact Us</>}
        description="Send us a message and a formation specialist will respond within one business day with next steps."
      />

      <section className="container-wide -mt-6 sm:-mt-8 lg:-mt-10 relative z-10">
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-5 lg:p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-900 leading-relaxed">
            <span className="font-semibold">Disclaimer:</span> We cannot answer legal, tax, or accounting
            questions. If you have questions about the formation process or about your order, please contact us.
          </p>
        </div>
      </section>

      <section className="container-wide section-pb">
        <div className="max-w-3xl mx-auto">
          <div>
            <form onSubmit={onSubmit} className="rounded-3xl border border-border bg-card p-8 lg:p-10 space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name *</Label>
                  <Input
                    id="name"
                    placeholder="Marisol Vega"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="marisol@example.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  rows={6}
                  placeholder="How can we help?"
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-3 pt-2 items-center justify-between">
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-trust" />
                  Document preparation service only.
                </span>
                <Button
                  type="submit"
                  size="lg"
                  className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 px-7"
                  disabled={submitting}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {submitting ? "Sending..." : "Send message"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
