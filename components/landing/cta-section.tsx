"use client";

import { Github, ArrowRight } from "lucide-react";
import { Button3D } from "@/components/ui/button-3d";
import { Container } from "@/components/shared/container";
import { HeroBackground } from "@/components/shared/hero-background";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

export function CTASection() {
  return (
    <section className="noise-overlay relative overflow-hidden py-20 md:py-28">
      {/* Architectural background */}
      <HeroBackground />

      <Container className="relative">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Ready to take control of your books?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Join thousands of developers building better financial tools with
              dubbl. Open source, forever free.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button3D variant="primary" size="lg">
                Get Started
                <ArrowRight className="size-4" />
              </Button3D>
              <Button3D variant="secondary" size="lg" asChild>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="size-4" />
                  View on GitHub
                </a>
              </Button3D>
            </div>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
