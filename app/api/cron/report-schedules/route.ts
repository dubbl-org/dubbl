import { NextResponse } from "next/server";
import { processReportSchedules } from "@/lib/reports/schedule-processor";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processReportSchedules();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Report schedules cron error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
