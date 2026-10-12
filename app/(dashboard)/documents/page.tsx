"use client";

import { Suspense } from "react";
import { FileBrowser } from "@/components/dashboard/documents/browser/browser";

export default function DocumentsPage() {
  return (
    <Suspense>
      <FileBrowser />
    </Suspense>
  );
}
