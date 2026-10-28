import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { resolveLocale } from "@/lib/i18n/locales";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function mergeMessages(
  fallback: Record<string, unknown>,
  messages: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.keys({ ...fallback, ...messages }).map((key) => {
    const base = fallback[key];
    const translated = messages[key];
    if (base && translated && typeof base === "object" && typeof translated === "object") {
      return [key, mergeMessages(base as Record<string, unknown>, translated as Record<string, unknown>)];
    }
    return [key, translated ?? base];
  }));
}

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("dubbl_locale")?.value;
  const session = await auth();
  const user = session?.user?.id
    ? await db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { locale: true } })
    : undefined;
  const locale = resolveLocale(cookieLocale ?? user?.locale);
  const english = (await import("../messages/en.json")).default;
  const french = locale.startsWith("fr") ? (await import("../messages/fr.json")).default : {};
  const regional = locale === "fr-CA" ? (await import("../messages/fr-CA.json")).default : {};
  return { locale, messages: mergeMessages(mergeMessages(english, french), regional) };
});
