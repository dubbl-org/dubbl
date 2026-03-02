import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Container-edge vertical lines */}
      <div className="pointer-events-none fixed inset-0 z-[60] flex justify-center">
        <div className="w-full max-w-[1400px]">
          <div className="relative h-full">
            <div className="absolute inset-y-0 left-0 w-px bg-foreground/10" />
            <div className="absolute inset-y-0 right-0 w-px bg-foreground/10" />
          </div>
        </div>
      </div>
      {/* Noise grain overlay */}
      <div className="noise-overlay pointer-events-none fixed inset-0 z-0" />

      <Navbar />
      <main className="relative z-10">{children}</main>
      <Footer />
    </>
  );
}
