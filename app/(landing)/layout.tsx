import "./landing.css";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Page rails — the vertical rules every section lines up with */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex justify-center">
        <div className="relative h-full w-full max-w-[1600px] border-x border-border" />
      </div>

      <Navbar />
      <main className="relative z-10">{children}</main>
      <div className="relative z-10">
        <Footer />
      </div>
    </>
  );
}
