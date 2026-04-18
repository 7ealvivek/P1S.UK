"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, LayoutDashboard, Globe, Server, Network, Cpu, Camera, Radar, Settings } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const pages = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Subdomains", href: "/subdomains", icon: Globe },
  { label: "Domains", href: "/domains", icon: Server },
  { label: "Ports", href: "/ports", icon: Network },
  { label: "Tech Stack", href: "/tech", icon: Cpu },
  { label: "Screenshots", href: "/screenshots", icon: Camera },
  { label: "Scans", href: "/scans", icon: Radar },
  { label: "Settings", href: "/settings", icon: Settings },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ subdomain: string; id: number }[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filteredPages = pages.filter((p) =>
    p.label.toLowerCase().includes(query.toLowerCase())
  );

  // Search subdomains when query changes
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await api.searchSubdomains(query, 5);
        setResults(
          (res.data as { subdomain: string; id: number }[]).map((r) => ({
            subdomain: r.subdomain,
            id: r.id,
          }))
        );
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
    }
  }, [open]);

  const allItems = [
    ...filteredPages.map((p) => ({ type: "page" as const, ...p })),
    ...results.map((r) => ({ type: "subdomain" as const, label: r.subdomain, href: `/subdomains?search=${r.subdomain}`, id: r.id })),
  ];

  const handleSelect = useCallback(
    (idx: number) => {
      const item = allItems[idx];
      if (item) {
        router.push(item.href);
        onClose();
      }
    },
    [allItems, router, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(selectedIdx);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg"
          >
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-modal shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 border-b border-[var(--border-default)]">
                <Search className="w-5 h-5 text-[var(--text-tertiary)]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIdx(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search pages, subdomains, actions..."
                  className="flex-1 py-4 bg-transparent text-body text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
                />
                <kbd className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[0.65rem] text-[var(--text-tertiary)]">ESC</kbd>
              </div>

              <div className="max-h-80 overflow-y-auto py-2">
                {filteredPages.length > 0 && (
                  <div className="px-3 py-1">
                    <span className="text-caption text-[var(--text-tertiary)] uppercase tracking-wider">Navigation</span>
                  </div>
                )}
                {filteredPages.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.href}
                      onClick={() => handleSelect(i)}
                      className={cn(
                        "flex items-center gap-3 w-full px-4 py-2.5 text-body text-left transition-colors",
                        selectedIdx === i
                          ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{p.label}</span>
                    </button>
                  );
                })}

                {results.length > 0 && (
                  <>
                    <div className="px-3 py-1 mt-2">
                      <span className="text-caption text-[var(--text-tertiary)] uppercase tracking-wider">Subdomains</span>
                    </div>
                    {results.map((r, i) => {
                      const idx = filteredPages.length + i;
                      return (
                        <button
                          key={r.id}
                          onClick={() => handleSelect(idx)}
                          className={cn(
                            "flex items-center gap-3 w-full px-4 py-2.5 text-body text-left transition-colors",
                            selectedIdx === idx
                              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                          )}
                        >
                          <Globe className="w-4 h-4" />
                          <span className="font-mono text-mono">{r.subdomain}</span>
                        </button>
                      );
                    })}
                  </>
                )}

                {allItems.length === 0 && query && (
                  <div className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                    No results found
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
