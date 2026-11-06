"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { NotificationsInbox } from "@/components/dashboard/notifications/inbox";

export default function NotificationsPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

// ?preferences=1 (from Settings > Notifications) opens the preferences panel straight away
function Inbox() {
  const openPreferences = useSearchParams().has("preferences");
  return <NotificationsInbox openPreferences={openPreferences} />;
}
