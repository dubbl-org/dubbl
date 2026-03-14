import { NextResponse } from "next/server";
import { retryFailedStripeEvents } from "@/lib/integrations/stripe/retry";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await retryFailedStripeEvents();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Stripe retry cron error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
