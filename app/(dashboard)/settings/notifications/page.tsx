import { redirect } from "next/navigation";

// Notification preferences live in one place: the panel on the notifications page
export default function NotificationSettingsRedirect() {
  redirect("/notifications?preferences=1");
}
