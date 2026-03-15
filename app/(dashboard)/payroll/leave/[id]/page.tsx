"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export default function LeaveRequestDetailPage() {
  const router = useRouter();
  useDocumentTitle("Payroll · Leave Details");
  useEffect(() => { router.replace("/payroll/leave"); }, [router]);
  return null;
}
