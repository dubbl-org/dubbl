import { redirect } from "next/navigation";

export default function UnlinkedDocumentsPage() {
  redirect("/documents?view=unlinked");
}
