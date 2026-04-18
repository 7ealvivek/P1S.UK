"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Shield } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ToastProvider } from "@/components/ui/toast";
import { useKeyboard } from "@/hooks/useKeyboard";
import "@/styles/globals.css";

function AppShell({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("p1w_token");
    if (!token && pathname !== "/login") {
      router.push("/login");
      setAuthed(false);
    } else {
      setAuthed(true);
    }
  }, [pathname, router]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useKeyboard({
    "mod+k": (e) => {
      e.preventDefault();
      setCmdOpen(true);
    },
  });

  if (authed === null) return null;

  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center gap-3 px-4 bg-[var(--bg-secondary)] border-b border-[var(--border-default)]">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Shield className="w-5 h-5 text-[var(--color-accent)]" />
        <span className="text-heading text-[var(--text-primary)] tracking-tight">P1 Warriors</span>
      </header>

      <main className="md:ml-[240px] min-h-screen transition-all duration-200 pt-14 md:pt-0">
        <div className="max-w-content mx-auto px-3 py-4 md:px-6 md:py-8">
          <Breadcrumbs />
          {children}
        </div>
      </main>
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>P1 Warriors — Attack Surface Management</title>
        <meta name="description" content="Subdomain monitoring and attack surface management" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
