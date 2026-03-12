import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoiceSignature } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { signatureDataUrl } = body;

    if (!signatureDataUrl || typeof signatureDataUrl !== "string") {
      return NextResponse.json(
        { error: "signatureDataUrl is required" },
        { status: 400 }
      );
    }

    const sig = await db.query.invoiceSignature.findFirst({
      where: eq(invoiceSignature.token, token),
    });

    if (!sig) {
      return NextResponse.json(
        { error: "Signature request not found" },
        { status: 404 }
      );
    }

    if (sig.status === "signed") {
      return NextResponse.json(
        { error: "This invoice has already been signed" },
        { status: 400 }
      );
    }

    if (sig.status === "declined") {
      return NextResponse.json(
        { error: "This signature request was declined" },
        { status: 400 }
      );
    }

    if (sig.expiresAt && new Date() > sig.expiresAt) {
      return NextResponse.json(
        { error: "This signing link has expired" },
        { status: 400 }
      );
    }

    // Extract IP and user agent from headers
    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress = forwarded
      ? forwarded.split(",")[0].trim()
      : request.headers.get("x-real-ip") || null;
    const userAgent = request.headers.get("user-agent") || null;

    const [updated] = await db
      .update(invoiceSignature)
      .set({
        signatureDataUrl,
        status: "signed",
        signedAt: new Date(),
        ipAddress,
        userAgent,
      })
      .where(eq(invoiceSignature.id, sig.id))
      .returning();

    return NextResponse.json({ signature: updated });
  } catch (err) {
    console.error("Sign error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
