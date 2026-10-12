import { redirect } from "next/navigation";

// Pipelines now live with the rest of the CRM.
export default function SettingsPipelinesRedirect() {
  redirect("/crm/pipelines");
}
