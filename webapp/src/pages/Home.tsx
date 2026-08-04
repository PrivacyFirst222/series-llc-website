import { HomeHero } from "@/components/home/HomeHero";
import { StatBar } from "@/components/home/StatBar";
import { WhyOnlyUs } from "@/components/home/WhyOnlyUs";
import { BenefitsGrid } from "@/components/home/BenefitsGrid";
import { StatuteTeaser } from "@/components/home/StatuteTeaser";
import { WeAreOne } from "@/components/home/WeAreOne";
import { CallToAction } from "@/components/sections/CallToAction";

export default function Home() {
  return (
    <>
      <HomeHero />
      <StatBar />
      <WhyOnlyUs />
      <BenefitsGrid limit={4} />
      <StatuteTeaser />
      <WeAreOne />
      <CallToAction />
    </>
  );
}
