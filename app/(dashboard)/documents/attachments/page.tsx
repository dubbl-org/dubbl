import { redirect } from "next/navigation";

export default function AttachedDocumentsPage() {
  redirect("/documents?view=linked");
}
