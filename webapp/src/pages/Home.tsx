import { HomeHero } from "@/components/home/HomeHero";
import { StatBar } from "@/components/home/StatBar";
import { MothershipDiagram } from "@/components/home/MothershipDiagram";
import { BenefitsGrid } from "@/components/home/BenefitsGrid";
import { FloridaEdge } from "@/components/home/FloridaEdge";
import { CallToAction } from "@/components/sections/CallToAction";

export default function Home() {
  return (
    <>
      <HomeHero />
      <StatBar />
      <MothershipDiagram />
      <BenefitsGrid />
      <FloridaEdge />
      <CallToAction />
    </>
  );
}
