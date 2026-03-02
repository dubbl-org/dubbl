import Link from "next/link";
import { Logo } from "@/components/shared/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="text-emerald-600" />
            <span className="text-lg font-bold tracking-tight">dubbl</span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
