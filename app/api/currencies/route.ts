import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currency } from "@/lib/db/schema";

export async function GET() {
  const currencies = await db.query.currency.findMany({
    orderBy: currency.code,
  });
  return NextResponse.json({ currencies });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, name, symbol, decimalPlaces } = body;

  if (!code || !name || !symbol) {
    return NextResponse.json(
      { error: "code, name, and symbol are required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(currency)
    .values({
      code: code.toUpperCase(),
      name,
      symbol,
      decimalPlaces: decimalPlaces ?? 2,
    })
    .returning();

  return NextResponse.json({ currency: created }, { status: 201 });
}
