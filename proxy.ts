import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export async function proxy(...args: Parameters<typeof auth>) {
  return auth(...args);
}

export const config = {
  // Exclude NextAuth's own routes: they already handle their own session
  // logic, and having the proxy independently re-process (and re-sign) the
  // session cookie on top of e.g. POST /api/auth/session (used by
  // useSession().update()) raced two competing Set-Cookie headers for the
  // same session token, unpredictably losing the update.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
