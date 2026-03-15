import { NextResponse } from "next/server";
import { getSiteSetting } from "@/lib/site-settings";

export async function GET() {
  const [registrationMode, allowedDomains] = await Promise.all([
    getSiteSetting("registration_mode"),
    getSiteSetting("allowed_email_domains"),
  ]);

  return NextResponse.json({
    google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    apple: !!(
      process.env.AUTH_APPLE_ID &&
      (process.env.AUTH_APPLE_KEY_BASE64 || process.env.AUTH_APPLE_SECRET)
    ),
    registrationMode,
    allowedDomains,
  });
}
