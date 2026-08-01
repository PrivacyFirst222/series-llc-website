import { HomeHero } from "@/components/home/HomeHero";
import { StatBar } from "@/components/home/StatBar";
import { BenefitsGrid } from "@/components/home/BenefitsGrid";
import { StatuteTeaser } from "@/components/home/StatuteTeaser";
import { CallToAction } from "@/components/sections/CallToAction";

export default function Home() {
  return (
    <>
      <HomeHero />
      <StatBar />
      <BenefitsGrid limit={4} />
      <StatuteTeaser />
      <CallToAction />
    </>
  );
}
