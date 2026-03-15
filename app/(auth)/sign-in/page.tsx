"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const isDev = process.env.NODE_ENV === "development";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}

interface ProvidersConfig {
  google: boolean;
  apple: boolean;
  registrationMode: string;
  allowedDomains: string;
}

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [providers, setProviders] = useState<ProvidersConfig | null>(null);

  useEffect(() => {
    fetch("/api/auth/providers-config")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders({ google: false, apple: false, registrationMode: "open", allowedDomains: "" }));
  }, []);

  const hasOAuth = providers?.google || providers?.apple;
  const registrationDisabled = providers?.registrationMode === "disabled";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  }

  async function handleDevLogin() {
    setError("");
    setDevLoading(true);

    try {
      const seedRes = await fetch("/api/auth/dev-login", { method: "POST" });
      if (!seedRes.ok) throw new Error("Failed to seed dev user");
      const { credentials, organizationId } = await seedRes.json();

      localStorage.setItem("activeOrgId", organizationId);

      const res = await signIn("credentials", {
        email: credentials.email,
        password: credentials.password,
        redirect: false,
      });

      if (res?.error) {
        throw new Error("Dev sign-in failed");
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dev login failed");
      setDevLoading(false);
    }
  }

  return (
    <div>
      <motion.div
        className="mb-7"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-[28px] font-extrabold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in to your account
        </p>
      </motion.div>

      {isDev && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-lg border-dashed border-amber-400/60 bg-amber-50/80 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50"
            onClick={handleDevLogin}
            disabled={devLoading}
          >
            {devLoading ? "Setting up..." : "Dev Login (test account)"}
          </Button>
          <div className="my-5 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-[11px] text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>
        </motion.div>
      )}

      {/* OAuth providers */}
      {hasOAuth && (
        <>
          <motion.div
            className={cn("grid gap-2.5", providers?.google && providers?.apple ? "grid-cols-2" : "grid-cols-1")}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            {providers?.google && (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-lg text-sm font-medium"
                onClick={() => signIn("google", { callbackUrl })}
              >
                <GoogleIcon className="size-4" />
                Google
              </Button>
            )}
            {providers?.apple && (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-lg text-sm font-medium"
                onClick={() => signIn("apple", { callbackUrl })}
              >
                <AppleIcon className="size-4" />
                Apple
              </Button>
            )}
          </motion.div>

          <div className="my-5 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-[11px] text-muted-foreground">
              or continue with email
            </span>
            <Separator className="flex-1" />
          </div>
        </>
      )}

      <motion.form
        onSubmit={handleSubmit}
        className="space-y-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-medium">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            className="h-11 rounded-lg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs font-medium">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            required
            className="h-11 rounded-lg"
          />
        </div>

        <Button
          type="submit"
          className="h-11 w-full rounded-lg bg-emerald-600 shadow-md shadow-emerald-600/15 transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-600/20 active:scale-[0.98]"
          disabled={loading}
        >
          {loading ? (
            "Signing in..."
          ) : (
            <span className="inline-flex items-center gap-2">
              Sign in
              <ArrowRight className="size-4" />
            </span>
          )}
        </Button>
      </motion.form>

      {!registrationDisabled && (
        <motion.p
          className="mt-6 text-center text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          Don&apos;t have an account?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-emerald-600 transition-colors hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            Sign up
          </Link>
        </motion.p>
      )}

      <motion.p
        className="mt-4 text-center text-[11px] text-muted-foreground/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        Bank-grade encryption &middot; Self-hosted option &middot; Apache 2.0
      </motion.p>
    </div>
  );
}
