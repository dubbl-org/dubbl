import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { trackLogin } from "@/lib/auth/track-login";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const { GET } = handlers;

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const isSignIn = url.pathname.endsWith("/callback/credentials")
    || url.pathname.endsWith("/callback/google")
    || url.pathname.endsWith("/callback/apple");

  const response = await handlers.POST(request);

  // Track login IP after successful sign-in
  if (isSignIn && response.status < 400) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const ua = request.headers.get("user-agent");

    // Determine provider from URL
    const provider = url.pathname.includes("/callback/google")
      ? "google"
      : url.pathname.includes("/callback/apple")
        ? "apple"
        : "credentials";

    // For credentials, extract email from form data to find user
    // For OAuth, we need to extract from the callback
    try {
      if (provider === "credentials") {
        const clonedReq = request.clone();
        const body = await clonedReq.formData().catch(() => null);
        const email = body?.get("email") as string | null;
        if (email) {
          const user = await db.query.users.findFirst({
            where: eq(users.email, email),
          });
          if (user) {
            trackLogin({ userId: user.id, ipAddress: ip, userAgent: ua, provider });
          }
        }
      }
      // OAuth callbacks - handled via the signIn event below
    } catch {
      // Don't block auth flow
    }
  }

  return response;
}
