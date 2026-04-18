"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const labels: Record<string, string> = {
  subdomains: "Subdomains",
  programs: "Programs",
  domains: "Domains",
  ports: "Ports",
  tech: "Tech Stack",
  screenshots: "Screenshots",
  scans: "Scans",
  settings: "Settings",
  login: "Login",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-2 mb-6 text-caption text-[var(--text-tertiary)]">
      <Link href="/" className="hover:text-[var(--text-secondary)] transition-colors">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {segments.map((seg, i) => (
        <div key={seg} className="flex items-center gap-2">
          <ChevronRight className="w-3 h-3" />
          {i === segments.length - 1 ? (
            <span className="text-[var(--text-secondary)]">{labels[seg] || seg}</span>
          ) : (
            <Link href={`/${segments.slice(0, i + 1).join("/")}`} className="hover:text-[var(--text-secondary)] transition-colors">
              {labels[seg] || seg}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
