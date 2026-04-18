"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { DomainData } from "@/lib/types";
import { formatNumber, timeAgo } from "@/lib/utils";
import { Plus, RefreshCw, Trash2, Loader2, Clock, CheckCircle2, AlertCircle, Bell, BellOff, Crosshair, Search } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { chartColors } from "@/lib/theme";

const PHASE_LABELS: Record<string, string> = {
  discovering: "Discovering subdomains...",
  bruteforce: "DNS brute-forcing...",
  mutations: "Generating mutations...",
  probing_http: "Probing HTTP...",
  port_scanning: "Port scanning...",
  screenshotting: "Taking screenshots...",
  done: "Done",
  queued: "Queued",
  pending: "Not scanned yet",
};

function ScanStatusBadge({ status, phase, progress }: { status: string; phase: string; progress?: Record<string, unknown> | null }) {
  if (status === "scanning") {
    const live = (progress?.live as number) || 0;
    const discovered = (progress?.discovered as number) || 0;
    return (
      <div className="flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 text-[var(--color-accent)] animate-spin" />
        <span className="text-caption text-[var(--color-accent)]">
          {PHASE_LABELS[phase] || "Scanning..."}{discovered > 0 ? ` (${live}/${discovered})` : ""}
        </span>
      </div>
    );
  }
  if (status === "queued") {
    return (
      <div className="flex items-center gap-1.5">
        <Clock className="w-3 h-3 text-[var(--text-tertiary)]" />
        <span className="text-caption text-[var(--text-tertiary)]">Queued</span>
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-3 h-3 text-[var(--color-success,#4ade80)]" />
        <span className="text-caption text-[var(--color-success,#4ade80)]">Done</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <AlertCircle className="w-3 h-3 text-[var(--text-tertiary)]" />
      <span className="text-caption text-[var(--text-tertiary)]">Never scanned</span>
    </div>
  );
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalDomains, setTotalDomains] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [scanNow, setScanNow] = useState(true);
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const fetchDomains = async (p = page, s = search) => {
    setLoading(true);
    try {
      const res = await api.getDomains(p, 50, s || undefined);
      const paged = res.data as unknown as { items: DomainData[]; total: number; pages: number };
      setDomains(paged.items || []);
      setTotalDomains(paged.total || 0);
      setTotalPages(paged.pages || 1);
    } catch {
      toast("Failed to load domains", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDomains(page, search);
    const interval = setInterval(() => {
      setDomains((prev) => {
        const hasActive = prev.some((d) => (d as unknown as Record<string, unknown>).scan_status === "scanning" || (d as unknown as Record<string, unknown>).scan_status === "queued");
        if (hasActive) fetchDomains(page, search);
        return prev;
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [page, search]);

  const handleAdd = async () => {
    if (bulkMode) {
      const lines = bulkText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      if (lines.length === 0) return;
      setAdding(true);
      try {
        const res = await api.bulkAddDomains(lines, scanNow);
        const { added, skipped } = res.data as { added: string[]; skipped: string[] };
        if (added.length > 0) toast(`Added ${added.length} domain${added.length > 1 ? "s" : ""}${skipped.length > 0 ? `, skipped ${skipped.length}` : ""}`, "success");
        else toast(`All ${skipped.length} domains already monitored or invalid`, "error");
        setAddOpen(false);
        setBulkText("");
        fetchDomains();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to add domains", "error");
      } finally {
        setAdding(false);
      }
    } else {
      if (!newDomain) return;
      setAdding(true);
      try {
        await api.addDomain(newDomain, scanNow);
        toast(`Added ${newDomain}`, "success");
        setAddOpen(false);
        setNewDomain("");
        fetchDomains();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to add domain", "error");
      } finally {
        setAdding(false);
      }
    }
  };

  const handleDialogClose = () => {
    setAddOpen(false);
    setNewDomain("");
    setBulkText("");
    setBulkMode(false);
  };

  const handleSweep = async (domain: string) => {
    try {
      await api.triggerSweep(domain);
      toast(`Sweep started for ${domain}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to trigger sweep", "error");
    }
  };

  const handleDelete = async (domain: string) => {
    if (!confirm(`Remove ${domain} from monitoring?`)) return;
    try {
      await api.deleteDomain(domain);
      toast(`Removed ${domain}`, "success");
      fetchDomains();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove domain", "error");
    }
  };

  const handleToggle = async (domain: string, field: "auto_sweep" | "deep_scan" | "leakix_daily", current: boolean) => {
    try {
      await api.patchDomain(domain, { [field]: !current });
      setDomains((prev) => prev.map((d) =>
        d.domain === domain ? { ...d, [field]: !current } : d
      ));
      const label = field === "auto_sweep" ? "Daily monitoring" : field === "leakix_daily" ? "LeakIX monitoring" : "Deep scan";
      toast(`${label} ${!current ? "enabled" : "disabled"} for ${domain}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update", "error");
    }
  };

  const totalSubs = domains.reduce((s, d) => s + d.total, 0);
  const totalNew = domains.reduce((s, d) => s + d.new, 0);

  return (
    <div>
      <Header
        title="Domains"
        description={`${formatNumber(totalDomains)} domains monitored`}
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" /> Add Domain
          </Button>
        }
      />

      {/* Summary */}
      <div className="flex gap-4 mb-4 text-body text-[var(--text-secondary)]">
        <span>{formatNumber(totalDomains)} domains</span>
        <span>•</span>
        <span>{formatNumber(totalSubs)} subdomains (this page)</span>
        {totalNew > 0 && (
          <>
            <span>•</span>
            <span className="text-[var(--color-accent)]">{totalNew} new</span>
          </>
        )}
      </div>
      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder="Search domains..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {domains.map((d) => (
            <Card
              key={d.domain}
              hover
              onClick={() => router.push(`/subdomains?domain=${d.domain}`)}
              className="relative"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="font-mono text-heading text-[var(--text-primary)]">{d.domain}</div>
              </div>
              <div className="mb-3">
                <ScanStatusBadge
                  status={(d as unknown as Record<string, unknown>).scan_status as string}
                  phase={(d as unknown as Record<string, unknown>).scan_phase as string}
                  progress={(d as unknown as Record<string, unknown>).scan_progress as Record<string, unknown> | null}
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center">
                  <div className="text-body tabular-nums text-[var(--text-primary)] font-medium">{formatNumber(d.total)}</div>
                  <div className="text-caption text-[var(--text-tertiary)]">Total</div>
                </div>
                <div className="text-center">
                  <div className={`text-body tabular-nums font-medium ${d.new > 0 ? "text-[var(--color-accent)]" : "text-[var(--text-primary)]"}`}>
                    {d.new}
                  </div>
                  <div className="text-caption text-[var(--text-tertiary)]">New</div>
                </div>
                <div className="text-center">
                  <div className="text-body tabular-nums text-[var(--text-primary)] font-medium">{d.with_ports}</div>
                  <div className="text-caption text-[var(--text-tertiary)]">Ports</div>
                </div>
                <div className="text-center">
                  <div className="text-body tabular-nums text-[var(--text-primary)] font-medium">{d.with_tech}</div>
                  <div className="text-caption text-[var(--text-tertiary)]">Tech</div>
                </div>
              </div>

              {/* Sparkline */}
              {d.sparkline_data.length > 1 && (
                <div className="h-12 mb-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={d.sparkline_data.map((v, i) => ({ i, v }))}>
                      <Area type="monotone" dataKey="v" stroke={chartColors.accent} fill={chartColors.accent} fillOpacity={0.1} strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top tech */}
              {d.top_tech.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {d.top_tech.map((t) => <Badge key={t}>{t}</Badge>)}
                </div>
              )}

              {/* Last scan */}
              {d.last_scan && (
                <div className="text-caption text-[var(--text-tertiary)]">
                  Last scan: {timeAgo(d.last_scan)}
                </div>
              )}

              {/* Toggle badges */}
              <div className="flex gap-1.5 mt-3">
                <button
                  title={`Daily auto-sweep: ${(d as unknown as Record<string,unknown>).auto_sweep ? "ON" : "OFF"} — click to toggle`}
                  onClick={(e) => { e.stopPropagation(); handleToggle(d.domain, "auto_sweep", !!(d as unknown as Record<string,unknown>).auto_sweep); }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-caption border transition-colors ${
                    (d as unknown as Record<string,unknown>).auto_sweep
                      ? "bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] text-[var(--color-accent)]"
                      : "bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                  }`}
                >
                  {(d as unknown as Record<string,unknown>).auto_sweep ? <Bell className="w-2.5 h-2.5" /> : <BellOff className="w-2.5 h-2.5" />}
                  Daily
                </button>
                <button
                  title={`Deep scan (bruteforce + mutations): ${(d as unknown as Record<string,unknown>).deep_scan ? "ON" : "OFF"} — click to toggle`}
                  onClick={(e) => { e.stopPropagation(); handleToggle(d.domain, "deep_scan", !!(d as unknown as Record<string,unknown>).deep_scan); }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-caption border transition-colors ${
                    (d as unknown as Record<string,unknown>).deep_scan
                      ? "bg-[color-mix(in_srgb,var(--color-critical)_15%,transparent)] border-[color-mix(in_srgb,var(--color-critical)_30%,transparent)] text-[var(--color-critical)]"
                      : "bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                  }`}
                >
                  <Crosshair className="w-2.5 h-2.5" /> Deep
                </button>
                <button
                  title={`LeakIX daily monitoring: ${(d as unknown as Record<string,unknown>).leakix_daily ? "ON" : "OFF"} — click to toggle`}
                  onClick={(e) => { e.stopPropagation(); handleToggle(d.domain, "leakix_daily", !!(d as unknown as Record<string,unknown>).leakix_daily); }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-caption border transition-colors ${
                    (d as unknown as Record<string,unknown>).leakix_daily
                      ? "bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] text-[var(--color-warning)]"
                      : "bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                  }`}
                >
                  <Search className="w-2.5 h-2.5" /> LeakIX
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSweep(d.domain);
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Sweep
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(d.domain);
                  }}
                  className="text-[var(--color-critical)]"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </Button>
              </div>
            </Card>
          ))}

          {/* Add Card */}
          <Card
            hover
            onClick={() => setAddOpen(true)}
            className="flex flex-col items-center justify-center min-h-[200px] border-dashed"
          >
            <Plus className="w-8 h-8 text-[var(--text-tertiary)] mb-2" />
            <span className="text-body text-[var(--text-secondary)]">Add Domain</span>
          </Card>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Button>
          <span className="text-body text-[var(--text-secondary)] px-2">Page {page} / {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next →</Button>
        </div>
      )}

      {/* Add Domain Dialog */}
      <Dialog open={addOpen} onClose={handleDialogClose} title="Add Domain">
        <div className="space-y-4">
          {/* Single / Bulk toggle */}
          <div className="flex gap-1 p-1 bg-[var(--bg-tertiary)] rounded-button w-fit">
            <button
              onClick={() => setBulkMode(false)}
              className={`px-3 py-1 text-body rounded transition-colors ${!bulkMode ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
            >
              Single
            </button>
            <button
              onClick={() => setBulkMode(true)}
              className={`px-3 py-1 text-body rounded transition-colors ${bulkMode ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
            >
              Bulk
            </button>
          </div>

          {bulkMode ? (
            <div>
              <label className="text-caption text-[var(--text-secondary)] mb-1 block">
                Domains <span className="text-[var(--text-tertiary)]">(one per line or comma-separated)</span>
              </label>
              <textarea
                placeholder={"example.com\ntarget.io\nbugbounty.com"}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                autoFocus
                rows={8}
                className="w-full bg-[var(--bg-tertiary)] text-body text-[var(--text-primary)] border border-[var(--border-default)] rounded-button px-3 py-2 font-mono text-mono resize-y focus:outline-none focus:border-[var(--color-accent)]"
              />
              <p className="text-caption text-[var(--text-tertiary)] mt-1">
                {bulkText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length} domains detected
              </p>
            </div>
          ) : (
            <div>
              <label className="text-caption text-[var(--text-secondary)] mb-1 block">Domain</label>
              <Input
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-body text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={scanNow}
              onChange={(e) => setScanNow(e.target.checked)}
              className="rounded"
            />
            Start scan immediately
          </label>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={handleDialogClose}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={adding || (bulkMode ? bulkText.trim() === "" : !newDomain)}
            >
              {adding ? "Adding..." : bulkMode ? `Add ${bulkText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length || ""} Domains` : "Add Domain"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
