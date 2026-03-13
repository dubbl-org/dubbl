import { createHash } from "crypto";
import { db } from "@/lib/db";
import { loginHistory, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { render } from "@react-email/render";
import { createElement } from "react";
import { LoginAlertEmail } from "@/lib/email/templates/login-alert";
import { sendPlatformEmail } from "@/lib/email/resend-client";

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function maskIp(ip: string): string {
  if (ip.includes(":")) {
    // IPv6: show first two groups
    const parts = ip.split(":");
    return `${parts[0]}:${parts[1]}:****:****`;
  }
  // IPv4: show first two octets
  const parts = ip.split(".");
  return `${parts[0]}.${parts[1]}.***.***`;
}

/**
 * Track a login event and send an email alert if the IP is new.
 * IPs are stored as SHA-256 hashes, never in plain text.
 * Fire-and-forget - errors are logged but don't block auth flow.
 */
export async function trackLogin(opts: {
  userId: string;
  ipAddress: string;
  userAgent: string | null;
  provider: string;
}) {
  try {
    const { userId, ipAddress, userAgent, provider } = opts;
    const ipHash = hashValue(ipAddress);
    const uaHash = userAgent ? hashValue(userAgent) : null;
    const label = parseUserAgent(userAgent);

    // Check if this IP has been seen before for this user
    const existing = await db.query.loginHistory.findFirst({
      where: and(
        eq(loginHistory.userId, userId),
        eq(loginHistory.ipHash, ipHash)
      ),
    });

    // Always log the login (hashed)
    await db.insert(loginHistory).values({
      userId,
      ipHash,
      userAgentHash: uaHash,
      displayLabel: label,
      provider,
      alerted: !existing,
    });

    // If IP is new, send alert email with masked IP
    if (!existing) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user?.email) return;

      const maskedIp = maskIp(ipAddress);

      const html = await render(
        createElement(LoginAlertEmail, {
          userName: user.name || "there",
          ipAddress: maskedIp,
          userAgent: label,
          provider: formatProvider(provider),
          timestamp: new Date().toLocaleString("en-US", {
            dateStyle: "long",
            timeStyle: "short",
          }),
          securityUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://dubbl.dev"}/settings/security`,
        })
      );

      await sendPlatformEmail({
        to: user.email,
        subject: `New sign-in from ${maskedIp}`,
        html,
      });
    }
  } catch (err) {
    console.error("[login-track] Failed to track login:", err);
  }
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown browser";
  if (ua.includes("Chrome") && !ua.includes("Edg")) {
    const match = ua.match(/Chrome\/([\d]+)/);
    return `Chrome ${match?.[1] || ""} on ${extractOS(ua)}`;
  }
  if (ua.includes("Firefox")) {
    const match = ua.match(/Firefox\/([\d]+)/);
    return `Firefox ${match?.[1] || ""} on ${extractOS(ua)}`;
  }
  if (ua.includes("Safari") && !ua.includes("Chrome")) {
    const match = ua.match(/Version\/([\d.]+)/);
    return `Safari ${match?.[1] || ""} on ${extractOS(ua)}`;
  }
  if (ua.includes("Edg")) {
    const match = ua.match(/Edg\/([\d]+)/);
    return `Edge ${match?.[1] || ""} on ${extractOS(ua)}`;
  }
  return ua.slice(0, 80);
}

function extractOS(ua: string): string {
  if (ua.includes("Mac OS X")) return "macOS";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown OS";
}

function formatProvider(provider: string): string {
  switch (provider) {
    case "credentials": return "Email & Password";
    case "google": return "Google";
    case "apple": return "Apple";
    default: return provider;
  }
}
