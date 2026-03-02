import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currency } from "@/lib/db/schema";

export async function GET() {
  const currencies = await db.query.currency.findMany({
    orderBy: currency.code,
  });
  return NextResponse.json({ currencies });
}
