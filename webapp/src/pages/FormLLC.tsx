import { useLocation } from "react-router-dom";
import { PageHero } from "@/components/sections/PageHero";
import { FloridaLLCFormationForm } from "@/components/forms/florida-llc/FloridaLLCFormationForm";

export default function FormLLC() {
  // The banner follows the path the card chose (14 Sep 2026: a converting
  // client was promised Articles of Organization).
  const location = useLocation();
  const fromState = (location.state as { path?: unknown } | null)?.path;
  const path = new URLSearchParams(location.search).get("path") ?? (typeof fromState === "string" ? fromState : null);
  const isConversion = path === "convert";
  return (
    <>
      <PageHero
        eyebrow="Florida LLC formation"
        align="center"
        title={
          <>
            Form your <em>Florida Protected Series LLC</em>
          </>
        }
        description={
          isConversion
            ? "Tell us about your existing LLC. We'll prepare Protected Series Designations for filing with the Florida Division of Corporations. Saved automatically as you go."
            : "Tell us about your LLC. We'll prepare clean, validated Articles of Organization for filing with the Florida Division of Corporations. Saved automatically as you go."
        }
      />
      <FloridaLLCFormationForm />
    </>
  );
}
