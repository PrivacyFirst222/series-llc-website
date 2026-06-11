import { PageHero } from "@/components/sections/PageHero";
import { FloridaLLCFormationForm } from "@/components/forms/florida-llc/FloridaLLCFormationForm";

export default function FormLLC() {
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
        description="Tell us about your LLC. We'll prepare clean, validated Articles of Organization for filing with the Florida Division of Corporations. Saved automatically as you go."
      />
      <FloridaLLCFormationForm />
    </>
  );
}
