"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Globe, Settings, ChevronLeft, ChevronRight, ChevronDown,
  LogOut, Sun, Moon, Shield, FileCode, Crosshair, AlertTriangle, Package, X,
  Server, Network, Cpu, Camera, Radar, ScanSearch, Bug, ShieldAlert, Activity, Bell, Target, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { NAV_ITEMS_PRIMARY, NAV_ITEMS_MORE } from "@/lib/constants";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard, Globe, Settings, FileCode, Crosshair, AlertTriangle, Package,
  Server, Network, Cpu, Camera, Radar, ScanSearch, Bug, ShieldAlert, Activity, Bell, Target, Zap,
};

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  const handleLogout = () => {
    localStorage.removeItem("p1w_token");
    window.location.href = "/login";
  };

  const NavLink = ({ item }: { item: { label: string; href: string; icon: string } }) => {
    const Icon = iconMap[item.icon];
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return (
      <Link
        href={item.href}
        onClick={onMobileClose}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
          collapsed && "justify-center px-0",
          active
            ? "bg-[var(--bg-active)] text-[var(--text-primary)] border-l-2 border-[var(--color-accent)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] border-l-2 border-transparent"
        )}
      >
        {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  };

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className={cn("flex items-center gap-3 px-4 h-14 border-b border-[var(--border-default)]", collapsed && "justify-center")}>
        <Shield className="w-5 h-5 text-[var(--color-accent)] flex-shrink-0" />
        {!collapsed && (
          <span className="font-semibold text-sm text-[var(--text-primary)] tracking-tight whitespace-nowrap flex-1">
            P1 Warriors
          </span>
        )}
        {onMobileClose && !collapsed && (
          <button onClick={onMobileClose} className="md:hidden text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {/* Primary items */}
        {NAV_ITEMS_PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {/* More toggle */}
        {!collapsed && (
          <button
            onClick={() => setMoreOpen(o => !o)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] transition-colors border-l-2 border-transparent mt-1"
          >
            <ChevronDown className={cn("w-4 h-4 flex-shrink-0 transition-transform", moreOpen && "rotate-180")} />
            <span>{moreOpen ? "Less" : "More"}</span>
          </button>
        )}

        {/* More items */}
        {(moreOpen || collapsed) && (
          <div className={cn("space-y-0.5", !collapsed && "pl-1")}>
            {NAV_ITEMS_MORE.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="p-2 border-t border-[var(--border-default)] space-y-0.5">
        <button
          onClick={toggle}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm",
            "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          {theme === "dark" ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
          {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>

        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm",
            "text-[var(--text-secondary)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--color-critical)] transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "hidden md:flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs",
            "text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-30 flex-col hidden md:flex",
          "bg-[var(--bg-secondary)] border-r border-[var(--border-default)]",
          "transition-all duration-200",
          collapsed ? "w-[56px]" : "w-[220px]"
        )}
      >
        <NavContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="relative w-[260px] h-full flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border-default)] z-50 animate-slide-in-left">
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}
