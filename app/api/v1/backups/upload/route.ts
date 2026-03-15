import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dataBackup } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { uploadBackup } from "@/lib/api/backup-storage";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "delete:organization");

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const jsonStr = await file.text();
    let snapshot: Record<string, unknown>;
    try {
      snapshot = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
    }

    if (!snapshot.version || !snapshot.entities) {
      return NextResponse.json({ error: "Invalid backup format" }, { status: 400 });
    }

    // Create backup record
    const [backup] = await db
      .insert(dataBackup)
      .values({
        organizationId: ctx.organizationId,
        type: "uploaded",
        status: "pending",
        createdBy: ctx.userId,
      })
      .returning();

    // Upload to S3
    const fileKey = `backups/${ctx.organizationId}/${backup.id}.json`;
    const sizeBytes = await uploadBackup(fileKey, jsonStr);

    // Calculate entity counts
    const entityCounts: Record<string, number> = {};
    const entities = snapshot.entities as Record<string, unknown>;
    for (const [key, value] of Object.entries(entities)) {
      if (Array.isArray(value)) entityCounts[key] = value.length;
    }

    // Update backup record
    const [updated] = await db
      .update(dataBackup)
      .set({ status: "completed", fileKey, sizeBytes, entityCounts })
      .where(eq(dataBackup.id, backup.id))
      .returning();

    logAudit({
      ctx,
      action: "create",
      entityType: "data_backup",
      entityId: updated.id,
      request,
    });

    return NextResponse.json({ backup: updated });
  } catch (err) {
    return handleError(err);
  }
}
