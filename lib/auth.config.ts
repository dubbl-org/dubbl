import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config — no Node.js imports (no pg, bcrypt, drizzle)
// Used by middleware. The full auth.ts extends this with adapter + authorize.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
    newUser: "/onboarding",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Public routes
      if (
        pathname === "/" ||
        pathname.startsWith("/pricing") ||
        pathname.startsWith("/sign-in") ||
        pathname.startsWith("/sign-up") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/stripe/webhook") ||
        pathname.startsWith("/api/currencies") ||
        pathname === "/api/mcp" ||
        pathname.startsWith("/api/mcp/") ||
        pathname.startsWith("/.well-known") ||
        pathname.startsWith("/docs") ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon")
      ) {
        return true;
      }

      // API routes with Bearer auth — let the route handler check
      const authHeader = request.headers.get("authorization");
      if (pathname.startsWith("/api/") && authHeader?.startsWith("Bearer ")) {
        return true;
      }

      // Protected routes require session
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.iat = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      // Pass token issued-at to session for revocation checks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).iat = token.iat;
      return session;
    },
  },
};
