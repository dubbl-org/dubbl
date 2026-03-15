import { NextResponse } from "next/server";
import { processTrashPurgeCron } from "@/lib/api/trash-purge-cron";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processTrashPurgeCron();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Trash purge cron error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
