"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { Bell, BellOff, Crosshair, Globe, ExternalLink, ChevronRight, Search } from "lucide-react";

const PLATFORM_LABELS: Record<string, string> = {
  hackerone: "HackerOne",
  bugcrowd:  "BugCrowd",
  intigriti: "Intigriti",
};

const PLATFORM_COLORS: Record<string, string> = {
  hackerone: "#f96820",
  bugcrowd:  "#f26822",
  intigriti: "#6644ff",
};

type Program = {
  id: number;
  name: string;
  handle: string;
  platform: string;
  url: string;
  min_bounty: number;
  max_bounty: number;
  currency: string;
  type: string;
  status: string;
  domain_count: number;
  sub_count: number;
  live_count: number;
  finding_count: number;
  critical_high: number;
  auto_sweep: boolean;
  auto_sweep_partial: boolean;
  deep_scan: boolean;
  deep_scan_partial: boolean;
};

function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] || "#888";
  const label = PLATFORM_LABELS[platform] || platform;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: color + "22", color }}
    >
      {label}
    </span>
  );
}

function BountyBadge({ min, max, currency }: { min: number; max: number; currency: string }) {
  if (!max) return null;
  const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;
  return (
    <span className="text-caption text-[var(--color-success,#4ade80)]">
      {min > 0 ? `${fmt(min)}–${fmt(max)}` : `up to ${fmt(max)}`}
    </span>
  );
}

export default function ProgramsPage() {
  const [programs, setPrograms]       = useState<Program[]>([]);
  const [loading, setLoading]         = useState(true);
  const [platform, setPlatform]       = useState("");
  const [search, setSearch]           = useState("");
  const [page, setPage]               = useState(1);
  const [totalPrograms, setTotal]     = useState(0);
  const [totalPages, setTotalPages]   = useState(1);
  const [platformStats, setPlatformStats] = useState<{ platform: string; program_count: number; domain_count: number }[]>([]);
  const [unmatchedCount, setUnmatched] = useState(0);
  const router = useRouter();
  const { toast } = useToast();

  const fetchPrograms = useCallback(async (p = page, pl = platform, s = search) => {
    setLoading(true);
    try {
      const res = await api.getPrograms(p, 48, pl || undefined, s || undefined);
      const paged = res.data as unknown as { items: Program[]; total: number; pages: number };
      setPrograms(paged.items || []);
      setTotal(paged.total || 0);
      setTotalPages(paged.pages || 1);
    } catch {
      toast("Failed to load programs", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.getPlatformStats();
      const d = res.data as unknown as { platforms: { platform: string; program_count: number; domain_count: number }[]; unmatched_domains: number };
      setPlatformStats(d.platforms || []);
      setUnmatched(d.unmatched_domains || 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchPrograms(page, platform, search);
  }, [page, platform, search]);

  const handlePlatform = (p: string) => {
    setPlatform(p);
    setPage(1);
  };

  const handleSearch = (s: string) => {
    setSearch(s);
    setPage(1);
  };

  const handleToggle = async (prog: Program, field: "auto_sweep" | "deep_scan") => {
    const current = field === "auto_sweep" ? prog.auto_sweep : prog.deep_scan;
    try {
      const res = await api.patchProgram(prog.id, { [field]: !current });
      const d = res.data as { domains_affected: number };
      const label = field === "auto_sweep" ? "Daily sweep" : "Deep scan";
      toast(`${label} ${!current ? "ON" : "OFF"} for ${prog.name} (${d.domains_affected} domains)`, "success");
      setPrograms(prev => prev.map(p =>
        p.id === prog.id ? { ...p, [field]: !current, [`${field}_partial`]: false } : p
      ));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update", "error");
    }
  };

  const tabs = [
    { key: "",            label: "All",        count: platformStats.reduce((s, p) => s + p.program_count, 0) || totalPrograms },
    { key: "hackerone",   label: "HackerOne",  count: platformStats.find(p => p.platform === "hackerone")?.program_count || 0 },
    { key: "bugcrowd",    label: "BugCrowd",   count: platformStats.find(p => p.platform === "bugcrowd")?.program_count || 0 },
    { key: "intigriti",   label: "Intigriti",  count: platformStats.find(p => p.platform === "intigriti")?.program_count || 0 },
  ];

  return (
    <div>
      <Header
        title="Programs"
        description={`${formatNumber(totalPrograms)} bug bounty programs across 3 platforms`}
      />

      {/* Platform tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => handlePlatform(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-button text-body whitespace-nowrap transition-colors ${
              platform === t.key
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
            <span className={`text-caption px-1.5 py-0.5 rounded-full ${
              platform === t.key ? "bg-white/20" : "bg-[var(--bg-secondary)]"
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <Input
            placeholder="Search programs..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-44 rounded-card bg-[var(--bg-secondary)] animate-pulse" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div className="text-center py-20 text-[var(--text-tertiary)]">
          <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No programs found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map(prog => (
            <Card key={prog.id} className="flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-[var(--text-primary)] text-body truncate">{prog.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <PlatformBadge platform={prog.platform} />
                    {prog.max_bounty > 0 && (
                      <BountyBadge min={prog.min_bounty} max={prog.max_bounty} currency={prog.currency} />
                    )}
                  </div>
                </div>
                {prog.url && (
                  <a
                    href={prog.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center">
                  <div className="text-body font-medium text-[var(--text-primary)] tabular-nums">{prog.domain_count}</div>
                  <div className="text-caption text-[var(--text-tertiary)]">Domains</div>
                </div>
                <div className="text-center">
                  <div className="text-body font-medium text-[var(--text-primary)] tabular-nums">{formatNumber(prog.sub_count)}</div>
                  <div className="text-caption text-[var(--text-tertiary)]">Subs</div>
                </div>
                <div className="text-center">
                  <div className={`text-body font-medium tabular-nums ${prog.live_count > 0 ? "text-[var(--color-success,#4ade80)]" : "text-[var(--text-primary)]"}`}>
                    {formatNumber(prog.live_count)}
                  </div>
                  <div className="text-caption text-[var(--text-tertiary)]">Live</div>
                </div>
                <div className="text-center">
                  <div className={`text-body font-medium tabular-nums ${prog.critical_high > 0 ? "text-[var(--color-critical,#f87171)]" : "text-[var(--text-primary)]"}`}>
                    {prog.finding_count}
                  </div>
                  <div className="text-caption text-[var(--text-tertiary)]">Findings</div>
                </div>
              </div>

              {/* Critical/High badge */}
              {prog.critical_high > 0 && (
                <div className="flex">
                  <Badge className="bg-[color-mix(in_srgb,var(--color-critical,#f87171)_15%,transparent)] text-[var(--color-critical,#f87171)] border-[color-mix(in_srgb,var(--color-critical,#f87171)_30%,transparent)]">
                    {prog.critical_high} CRIT/HIGH
                  </Badge>
                </div>
              )}

              {/* Sweep toggles */}
              <div className="flex gap-2 pt-1 border-t border-[var(--border-subtle)]">
                <button
                  title={`Daily auto-sweep all ${prog.domain_count} domains: ${prog.auto_sweep ? "ON" : prog.auto_sweep_partial ? "PARTIAL" : "OFF"}`}
                  onClick={() => handleToggle(prog, "auto_sweep")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-button text-caption border transition-colors flex-1 justify-center ${
                    prog.auto_sweep
                      ? "bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] text-[var(--color-accent)]"
                      : prog.auto_sweep_partial
                      ? "bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] border-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--text-tertiary)]"
                      : "bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                  }`}
                >
                  {prog.auto_sweep ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                  Daily{prog.auto_sweep_partial ? " (~)" : ""}
                </button>
                <button
                  title={`Deep scan all ${prog.domain_count} domains: ${prog.deep_scan ? "ON" : prog.deep_scan_partial ? "PARTIAL" : "OFF"}`}
                  onClick={() => handleToggle(prog, "deep_scan")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-button text-caption border transition-colors flex-1 justify-center ${
                    prog.deep_scan
                      ? "bg-[color-mix(in_srgb,var(--color-critical,#f87171)_15%,transparent)] border-[color-mix(in_srgb,var(--color-critical,#f87171)_30%,transparent)] text-[var(--color-critical,#f87171)]"
                      : prog.deep_scan_partial
                      ? "bg-[color-mix(in_srgb,var(--color-critical,#f87171)_8%,transparent)] border-[color-mix(in_srgb,var(--color-critical,#f87171)_15%,transparent)] text-[var(--text-tertiary)]"
                      : "bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                  }`}
                >
                  <Crosshair className="w-3 h-3" /> Deep{prog.deep_scan_partial ? " (~)" : ""}
                </button>
                <button
                  onClick={() => router.push(`/subdomains?program_id=${prog.id}`)}
                  className="flex items-center gap-1 px-2 py-1 rounded-button text-caption border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  title="View all subdomains for this program"
                >
                  View <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
          <span className="text-body text-[var(--text-secondary)]">Page {page} / {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
        </div>
      )}

      {/* Unmatched note */}
      {unmatchedCount > 0 && !search && (
        <div className="mt-6 p-4 rounded-card bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-body text-[var(--text-tertiary)]">
          <span className="font-medium text-[var(--text-secondary)]">{formatNumber(unmatchedCount)} domains</span> didn&apos;t match any known program scope — likely from private programs.
          {" "}<button onClick={() => router.push("/domains")} className="text-[var(--color-accent)] hover:underline">View in Domains →</button>
        </div>
      )}
    </div>
  );
}
