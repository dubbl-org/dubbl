import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BentoFeatures } from "@/components/landing/bento-features";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { FeatureSections } from "@/components/landing/feature-sections";
import { OpenSource } from "@/components/landing/open-source";
import { Integrations } from "@/components/landing/integrations";
import { Testimonials } from "@/components/landing/testimonials";
import { FAQ } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta-section";

export default function Home() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <BentoFeatures />
      <FeatureSections />
      <DashboardPreview />
      <OpenSource />
      <Integrations />
      <Testimonials />
      <FAQ />
      <CTASection />
    </>
  );
}
