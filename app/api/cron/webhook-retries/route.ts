import { NextResponse } from "next/server";
import { retryFailedDeliveries } from "@/lib/webhooks/deliver";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await retryFailedDeliveries();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Webhook retry cron error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
