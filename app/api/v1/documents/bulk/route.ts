import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { ok, handleError } from "@/lib/api/response";
import {
  moveDocuments,
  purgeDocuments,
  restoreDocuments,
  setDocumentVisibility,
  starDocuments,
  trashDocuments,
} from "@/lib/documents/actions";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), ids: z.array(z.string().uuid()).min(1).max(500), folderId: z.string().uuid().nullable() }),
  z.object({ action: z.enum(["trash", "restore", "purge", "star", "unstar", "share", "private"]), ids: z.array(z.string().uuid()).min(1).max(500) }),
]);

/** One action on many files. Files you can't see are skipped. */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = schema.parse(await request.json());
    switch (body.action) {
      case "move":
        return ok(await moveDocuments(ctx, body.ids, body.folderId));
      case "trash":
        return ok(await trashDocuments(ctx, body.ids));
      case "restore":
        return ok(await restoreDocuments(ctx, body.ids));
      case "purge":
        return ok(await purgeDocuments(ctx, body.ids));
      case "star":
      case "unstar":
        return ok(await starDocuments(ctx, body.ids, body.action === "star"));
      case "share":
      case "private":
        return ok(await setDocumentVisibility(ctx, body.ids, body.action === "share" ? "organization" : "private"));
    }
  } catch (err) {
    return handleError(err);
  }
}
