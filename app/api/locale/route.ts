import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { locales } from "@/lib/i18n/locales";
const schema = z.object({ locale: z.enum(locales) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  const response = NextResponse.json({ locale: parsed.data.locale });
  response.cookies.set("dubbl_locale", parsed.data.locale, { sameSite: "lax", maxAge: 31536000, path: "/" });
  const session = await auth();
  if (session?.user?.id) await db.update(users).set({ locale: parsed.data.locale }).where(eq(users.id, session.user.id));
  return response;
}
