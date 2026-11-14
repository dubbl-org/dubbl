import { getServerContext } from "@/lib/server/context";
import { listFolders, listDocuments } from "@/lib/server/data/documents";
import { toClient } from "@/lib/server/data/serialize";
import DocumentsPage, { type DocFolder, type Doc } from "./documents-client";

export default async function Page() {
  const ctx = await getServerContext();
  const [folders, documents] = await Promise.all([
    listFolders(ctx.organizationId),
    listDocuments(ctx.organizationId, 100),
  ]);
  return (
    <DocumentsPage
      initialFolders={toClient<DocFolder[]>(folders)}
      initialDocuments={toClient<Doc[]>(documents)}
    />
  );
}
