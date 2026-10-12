import { getAuthContext } from "@/lib/api/auth-context";
import { ok, handleError } from "@/lib/api/response";
import { browse, VIEWS, type BrowseView } from "@/lib/documents/browse";

/**
 * Everything the file browser shows at once: folders with counts, the files in
 * the current view, and per-view counts for the sidebar.
 *
 * ?view=folder&folder=<id>   files directly in a folder (no folder = top level)
 * ?view=recent|starred|unlinked|linked|private|trash
 * ?view=record&type=bill     files attached to one kind of record
 * ?view=search&q=receipt     name search across every file you can see
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const raw = url.searchParams.get("view") ?? "folder";
    const view = ((VIEWS as readonly string[]).includes(raw) ? raw : "folder") as BrowseView;
    const folder = url.searchParams.get("folder");
    return ok(
      await browse({
        orgId: ctx.organizationId,
        userId: ctx.userId,
        view,
        folderId: folder && /^[0-9a-f-]{36}$/i.test(folder) ? folder : null,
        recordType: url.searchParams.get("type"),
        q: url.searchParams.get("q"),
      })
    );
  } catch (err) {
    return handleError(err);
  }
}
