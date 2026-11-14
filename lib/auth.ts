import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { rateLimit } from "@/lib/api/rate-limit";

// Constant-work target for the unknown-email path in credentials authorize
// (timing-based email enumeration). Bcrypt hash of random data.
const DUMMY_BCRYPT_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7Ff7UiLzQSKiF4TnCBmCY0YCAa5YQ9S";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { headers } from "next/headers";
import { trackLogin } from "./auth/track-login";
import { getAppleClientSecret } from "./auth/apple-secret";
import { getSiteSetting } from "./site-settings";
import { sql } from "drizzle-orm";
import { isTwoFactorEnabled, verifyTwoFactor } from "./auth/two-factor";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // Optional second factor. Only consulted when the user has 2FA enabled, so
  // password-only login is unaffected for everyone else (2FA is opt-in).
  totp: z.string().optional(),
});

// Thrown from authorize() when a 2FA-enabled user signs in with a correct
// password but no TOTP code. Extends CredentialsSignin so NextAuth surfaces the
// `code` to the client (res.code === "TwoFactorRequired"), letting the sign-in
// page prompt for a code instead of showing a generic error.
export class TwoFactorRequiredError extends CredentialsSignin {
  code = "TwoFactorRequired";
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  // Generate Apple client secret from .p8 key if configured,
  // otherwise use the default Apple provider (reads AUTH_APPLE_SECRET)
  // allowDangerousEmailAccountLinking stays false (the default): combined with
  // no email verification at registration, auto-linking lets anyone who
  // registers a victim's email attach their own OAuth identity to that account.
  const appleProvider = process.env.AUTH_APPLE_KEY_BASE64
    ? Apple({
        clientId: process.env.AUTH_APPLE_ID,
        clientSecret: await getAppleClientSecret(),
      })
    : Apple({ clientId: process.env.AUTH_APPLE_ID });

  return {
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google({})]
      : []),
    ...(process.env.AUTH_APPLE_ID && (process.env.AUTH_APPLE_KEY_BASE64 || process.env.AUTH_APPLE_SECRET)
      ? [appleProvider]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Per-account throttle: 10 attempts / 15 min.
        if (!rateLimit(`login:${parsed.data.email.toLowerCase()}`, 10)) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, parsed.data.email),
        });

        // Equalize timing so sign-in cannot enumerate registered emails.
        if (!user?.passwordHash) {
          await bcrypt.compare(parsed.data.password, DUMMY_BCRYPT_HASH);
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!valid) return null;

        // Opt-in second factor: only enforced when the user has enabled 2FA.
        if (await isTwoFactorEnabled(user.id)) {
          const code = parsed.data.totp?.trim();
          if (!code) throw new TwoFactorRequiredError();
          const ok = await verifyTwoFactor(user.id, code);
          if (!ok) return null;
        }

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Skip checks for credentials (already validated in register route)
      if (account?.provider === "credentials") return true;

      const email = user.email;
      if (!email) return false;

      // Check domain restriction
      const allowedDomains = await getSiteSetting("allowed_email_domains");
      if (allowedDomains) {
        const domains = allowedDomains.split(",").map((d) => d.trim().toLowerCase());
        const emailDomain = email.split("@")[1]?.toLowerCase();
        if (!emailDomain || !domains.includes(emailDomain)) return false;
      }

      // Check if user already exists (existing user = sign in, not registration)
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (existingUser) {
        // 2FA is a promise to the user. Google/Apple sign-in cannot ask for a
        // code, so for an account that has it enabled we refuse the OAuth path
        // and send them to password + code instead of silently skipping it.
        if (await isTwoFactorEnabled(existingUser.id)) {
          return "/sign-in?error=2fa_required";
        }
        return true;
      }

      // New OAuth user = registration
      const [{ count: userCount }] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(users);
      const isFirstUser = userCount === 0;

      if (!isFirstUser) {
        const registrationMode = await getSiteSetting("registration_mode");
        if (registrationMode === "disabled") return false;
        if (registrationMode === "invite_only") return false;
      }

      return true;
    },
  },
  events: {
    async signIn({ user, account }) {
      // Track OAuth logins (credentials tracked in route handler)
      if (account?.provider && account.provider !== "credentials" && user.id) {
        const hdrs = await headers();
        const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim()
          || hdrs.get("x-real-ip")
          || "unknown";
        const ua = hdrs.get("user-agent");
        trackLogin({
          userId: user.id,
          ipAddress: ip,
          userAgent: ua,
          provider: account.provider,
        });
      }
    },
    async createUser({ user }) {
      if (!user.id) return;

      // Check if first user (count <= 1 because this user was just created)
      const [{ count: userCount }] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(users);
      const isFirstUser = userCount <= 1;

      if (isFirstUser) {
        await db.update(users).set({ isSiteAdmin: true }).where(eq(users.id, user.id));
      }
    },
  },
  };
});
