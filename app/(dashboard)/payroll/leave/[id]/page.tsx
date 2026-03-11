"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LeaveRequestDetailPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/payroll/leave"); }, [router]);
  return null;
}
