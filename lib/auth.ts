import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { headers } from "next/headers";
import { trackLogin } from "./auth/track-login";
import { getAppleClientSecret } from "./auth/apple-secret";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  // Generate Apple client secret from .p8 key if configured,
  // otherwise use the default Apple provider (reads AUTH_APPLE_SECRET)
  const appleProvider = process.env.AUTH_APPLE_KEY_BASE64
    ? Apple({
        clientId: process.env.AUTH_APPLE_ID,
        clientSecret: await getAppleClientSecret(),
      })
    : Apple;

  return {
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google,
    appleProvider,
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, parsed.data.email),
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
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
  },
  };
});
