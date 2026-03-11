"use client";

import { useState, useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FileText, ScrollText, MessageSquare, CreditCard } from "lucide-react";

interface PortalInfo {
  contact: { id: string; name: string };
  organization: { name: string };
}

const tabs = [
  { href: "", label: "Overview", icon: FileText },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/statements", label: "Statements", icon: ScrollText },
  { href: "/quotes", label: "Quotes", icon: MessageSquare },
  { href: "/payments", label: "Payments", icon: CreditCard },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { token } = useParams<{ token: string }>();
  const pathname = usePathname();
  const [info, setInfo] = useState<PortalInfo | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then(r => r.ok ? r.json() : null)
      .then(setInfo)
      .catch(() => {});
  }, [token]);

  const basePath = `/portal/${token}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {info?.organization.name || "Loading..."}
            </h1>
            <p className="text-sm text-gray-500">Customer Portal</p>
          </div>
          <p className="text-sm text-gray-600">{info?.contact.name}</p>
        </div>
      </header>

      <nav className="border-b bg-white">
        <div className="mx-auto max-w-4xl flex gap-1 px-6">
          {tabs.map(tab => {
            const href = `${basePath}${tab.href}`;
            const isActive = tab.href === ""
              ? pathname === basePath
              : pathname.startsWith(href);
            return (
              <Link
                key={tab.href}
                href={href}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors",
                  isActive
                    ? "border-blue-600 text-blue-600 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
