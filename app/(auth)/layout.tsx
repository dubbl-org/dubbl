"use client";

import { Logo } from "@/components/shared/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <Logo className="w-12 h-12 rounded-lg mb-3" />
            <h1 className="text-xl font-bold text-foreground">PayrollPro</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to your account
            </p>
          </div>

          {/* Form card */}
          <div className="bg-card border border-border rounded-md p-6 shadow-sm">
            {children}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-3 text-center text-xs text-muted-foreground">
        Created by{" "}
        <a
          href="https://citrusappslab.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium"
        >
          Citrus Apps Lab
        </a>
      </div>
    </div>
  );
}
