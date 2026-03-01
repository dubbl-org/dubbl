import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { TrustBar } from "@/components/landing/trust-bar";
import { BentoFeatures } from "@/components/landing/bento-features";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { FeatureSections } from "@/components/landing/feature-sections";
import { OpenSource } from "@/components/landing/open-source";
import { Integrations } from "@/components/landing/integrations";
import { Testimonials } from "@/components/landing/testimonials";
import { FAQ } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustBar />
        <BentoFeatures />
        <DashboardPreview />
        <FeatureSections />
        <OpenSource />
        <Integrations />
        <Testimonials />
        <FAQ />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
