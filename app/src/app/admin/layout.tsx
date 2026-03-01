"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bike,
  Users,
  FileText,
  Activity,
  Upload,
  Settings,
  Menu,
  X,
  ClipboardList,
  ImagePlus,
  Flag,
  Leaf,
} from "lucide-react";
import { useState } from "react";
import { useServiceWorker } from "@/lib/use-service-worker";
import { PwaInstallPrompt } from "@/components/admin/pwa-install-prompt";
import { NotificationToggle } from "@/components/admin/notification-toggle";

const sidebarItems = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/courses", label: "코스 관리", icon: Bike },
  { href: "/admin/courses/import", label: "일괄 가져오기", icon: Upload },
  { href: "/admin/users", label: "사용자 관리", icon: Users },
  { href: "/admin/gpx", label: "GPX 관리", icon: FileText },
  { href: "/admin/improvement-requests", label: "수정 요청", icon: ClipboardList },
  { href: "/admin/checkpoint-photos", label: "CP 사진", icon: ImagePlus },
  { href: "/admin/reports", label: "신고 관리", icon: Flag },
  { href: "/admin/seasonal", label: "시즌 추천", icon: Leaf },
  { href: "/admin/system", label: "시스템 상태", icon: Activity },
  { href: "/admin/settings", label: "설정", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Register service worker for admin PWA
  useServiceWorker();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  const sidebar = (
    <nav className="flex h-full flex-col p-3">
      <div className="flex-1 space-y-1">
        {sidebarItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-white/15 text-t-accent"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </div>

      {/* PWA install + notification controls */}
      <div className="border-t border-white/10 pt-2 space-y-1">
        <PwaInstallPrompt />
        <NotificationToggle />
      </div>
    </nav>
  );

  return (
    <div className="flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 border-r border-white/10 bg-t-sidebar md:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar toggle */}
      <button
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-sky-darkblue text-white shadow-lg md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-56 border-r border-white/10 bg-t-sidebar md:hidden">
            {sidebar}
          </aside>
        </>
      )}

      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
