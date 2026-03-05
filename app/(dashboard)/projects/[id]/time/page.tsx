"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function TimeEntriesRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/projects/${id}`);
  }, [id, router]);

  return null;
}
