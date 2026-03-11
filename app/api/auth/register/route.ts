import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, organization, member, subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.parse(body);

    // Check if email exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, parsed.email),
    });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        name: parsed.name,
        email: parsed.email,
        passwordHash,
      })
      .returning();

    // Create default organization
    const slug = parsed.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const [org] = await db
      .insert(organization)
      .values({
        name: `${parsed.name}'s Org`,
        slug: `${slug}-${Date.now().toString(36)}`,
      })
      .returning();

    // Add user as owner
    await db.insert(member).values({
      organizationId: org.id,
      userId: user.id,
      role: "owner",
    });

    // Create free subscription
    await db.insert(subscription).values({
      organizationId: org.id,
      plan: "free",
      status: "active",
    });

    return NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    console.error("Registration error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
