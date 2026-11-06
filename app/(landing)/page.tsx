import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Developers } from "@/components/landing/developers";
import { Pricing } from "@/components/landing/pricing";
import { FAQ } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta-section";

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <Developers />
      <Pricing />
      <FAQ />
      <CTASection />
    </>
  );
}
