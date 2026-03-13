import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, organization, member, subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Dev login supports both the quick dev user AND the full demo user from seed.ts
const DEV_USER = {
  email: "dev@dubbl.local",
  name: "Dev User",
  password: "devdevdev",
};

const DEMO_USER = {
  email: "demo@dubbl.dev",
  password: "password123",
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  // Check if seeded demo user exists
  const demoUser = await db.query.users.findFirst({
    where: eq(users.email, DEMO_USER.email),
  });

  const membership = demoUser
    ? await db.query.member.findFirst({
        where: eq(member.userId, demoUser.id),
        with: { organization: true },
      })
    : null;

  return NextResponse.json({
    demo: demoUser
      ? {
          email: DEMO_USER.email,
          password: DEMO_USER.password,
          organizationId: membership?.organization?.id,
          organizationName: membership?.organization?.name,
          note: "Full demo data from seed.ts",
        }
      : { note: "Run `npx tsx lib/db/seed.ts` to create demo data" },
    dev: {
      email: DEV_USER.email,
      password: DEV_USER.password,
      note: "Quick dev user (POST to this route to create)",
    },
  });
}

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Dev login is only available in development" },
      { status: 403 }
    );
  }

  // Find or create dev user
  let user = await db.query.users.findFirst({
    where: eq(users.email, DEV_USER.email),
  });

  if (user && !user.isSiteAdmin) {
    await db
      .update(users)
      .set({ isSiteAdmin: true })
      .where(eq(users.id, user.id));
    user = { ...user, isSiteAdmin: true };
  }

  if (!user) {
    const passwordHash = await bcrypt.hash(DEV_USER.password, 12);
    const [created] = await db
      .insert(users)
      .values({
        name: DEV_USER.name,
        email: DEV_USER.email,
        passwordHash,
        isSiteAdmin: true,
      })
      .returning();
    user = created;
  }

  // Find or create dev org
  let org = await db.query.organization.findFirst({
    where: eq(organization.slug, "test-org"),
  });

  if (!org) {
    const [created] = await db
      .insert(organization)
      .values({ name: "Test Organization", slug: "test-org" })
      .returning();
    org = created;

    await db
      .insert(member)
      .values({ organizationId: org.id, userId: user.id, role: "owner" })
      .onConflictDoNothing();

    await db
      .insert(subscription)
      .values({ organizationId: org.id, plan: "free", status: "active" })
      .onConflictDoNothing();
  } else {
    await db
      .insert(member)
      .values({ organizationId: org.id, userId: user.id, role: "owner" })
      .onConflictDoNothing();
  }

  return NextResponse.json({
    credentials: { email: DEV_USER.email, password: DEV_USER.password },
    organizationId: org.id,
  });
}
