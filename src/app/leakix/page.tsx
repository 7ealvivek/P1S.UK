"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

const SEV_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/30",
  high: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  info: "text-gray-400 bg-gray-400/10 border-gray-400/30",
};
const SEV_DOT: Record<string, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-blue-400",
  info: "bg-gray-400",
};

interface LeakRow {
  id: number;
  root_domain: string;
  host: string;
  ip: string;
  port: string;
  event_source: string;
  plugin_label: string;
  severity: string;
  summary: string;
  found_at: string;
  discovered_at: string;
}

interface Stats {
  total: number;
  new_today: number;
  by_severity: { severity: string; count: number }[];
  by_domain: { root_domain: string; count: number }[];
}

function getAuthHeader() {
  return { Authorization: `Bearer ${localStorage.getItem("p1w_token")}` };
}

export default function LeakIXPage() {
  const [leaks, setLeaks] = useState<LeakRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [sevFilter, setSevFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const perPage = 50;

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/leakix/stats", { headers: getAuthHeader() });
      const d = await res.json();
      setStats(d.data);
    } catch {}
  }, []);

  const fetchLeaks = useCallback(
    async (p: number = 1, sev: string = sevFilter, dom: string = domainFilter) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), per_page: String(perPage) });
        if (sev) params.set("severity", sev);
        if (dom) params.set("domain", dom);
        const res = await fetch(`/api/leakix/leaks?${params}`, { headers: getAuthHeader() });
        const d = await res.json();
        setLeaks(d.data || []);
        setTotal(d.meta?.total || 0);
        setPage(d.meta?.page || 1);
        setPages(d.meta?.pages || 1);
      } catch {
        toast("Failed to load leaks", "error");
      } finally {
        setLoading(false);
      }
    },
    [sevFilter, domainFilter, toast]
  );

  useEffect(() => {
    fetchStats();
    fetchLeaks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const i = setInterval(() => {
      fetchStats();
      fetchLeaks(page, sevFilter, domainFilter);
    }, 60000);
    return () => clearInterval(i);
  }, [page, sevFilter, domainFilter, fetchStats, fetchLeaks]);

  const handleSevFilter = (sev: string) => {
    setSevFilter(sev);
    fetchLeaks(1, sev, domainFilter);
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/leakix/scan", {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Scan failed");
      const total_new = Object.values(d.data?.new_findings || {}).reduce(
        (a: number, b) => a + (typeof b === "number" ? b : 0),
        0
      );
      toast(`Scan complete — ${total_new} new findings`, "success");
      fetchStats();
      fetchLeaks(1, sevFilter, domainFilter);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Scan failed", "error");
    } finally {
      setScanning(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const sevCounts = Object.fromEntries(
    (stats?.by_severity || []).map((s) => [s.severity, s.count])
  );
  const domains = [...new Set((stats?.by_domain || []).map((d) => d.root_domain))];
  const SEVS = ["critical", "high", "medium", "low", "info"];

  return (
    <div>
      <Header
        title="LeakIX"
        description={`${total.toLocaleString()} findings across ${domains.length} domain${domains.length !== 1 ? "s" : ""}`}
        actions={
          <Button size="sm" onClick={handleScan} disabled={scanning}>
            <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning..." : "Scan Now"}
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total", value: stats?.total ?? 0, color: "var(--text-primary)" },
          { label: "New (24h)", value: stats?.new_today ?? 0, color: "var(--color-accent)" },
          { label: "Critical", value: sevCounts["critical"] ?? 0, color: "#ef4444" },
          { label: "High", value: sevCounts["high"] ?? 0, color: "#f97316" },
          { label: "Medium", value: sevCounts["medium"] ?? 0, color: "#eab308" },
          { label: "Low", value: sevCounts["low"] ?? 0, color: "#3b82f6" },
        ].map((s) => (
          <Card key={s.label} className="text-center py-3">
            <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="text-caption text-[var(--text-tertiary)] mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => handleSevFilter("")}
          className={`px-3 py-1.5 rounded-badge text-body transition-colors ${
            !sevFilter
              ? "bg-[var(--color-accent)] text-black"
              : "bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-secondary)]"
          }`}
        >
          All
        </button>
        {SEVS.map((s) => (
          <button
            key={s}
            onClick={() => handleSevFilter(s)}
            className={`px-3 py-1.5 rounded-badge text-body capitalize transition-colors border ${
              sevFilter === s
                ? SEV_COLORS[s]
                : "bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-secondary)]"
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SEV_DOT[s]}`} />
            {s} {sevCounts[s] ? `(${sevCounts[s]})` : ""}
          </button>
        ))}
        {domains.length > 1 && (
          <select
            value={domainFilter}
            onChange={(e) => {
              setDomainFilter(e.target.value);
              fetchLeaks(1, sevFilter, e.target.value);
            }}
            className="px-3 py-1.5 rounded-badge text-body bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-secondary)]"
          >
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Leak list */}
      {loading ? (
        <TableSkeleton rows={10} />
      ) : leaks.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          No findings yet — click &quot;Scan Now&quot; to fetch from LeakIX
        </div>
      ) : (
        <div className="space-y-2">
          {leaks.map((leak) => (
            <div
              key={leak.id}
              className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden"
            >
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                onClick={() => toggleExpand(leak.id)}
              >
                <span
                  className={`text-caption font-medium px-2 py-0.5 rounded border capitalize ${
                    SEV_COLORS[leak.severity] || SEV_COLORS.info
                  }`}
                >
                  {leak.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-body text-[var(--text-primary)] font-medium">
                    {leak.plugin_label || leak.event_source}
                  </div>
                  <div className="text-caption text-[var(--text-tertiary)] font-mono">
                    {leak.host}
                    {leak.port ? `:${leak.port}` : ""}
                    {leak.ip && leak.ip !== leak.host ? (
                      <span className="ml-2 opacity-60">({leak.ip})</span>
                    ) : null}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-caption text-[var(--text-tertiary)]">{leak.root_domain}</div>
                  <div className="text-caption text-[var(--text-tertiary)]">
                    {leak.found_at ? leak.found_at.slice(0, 10) : "—"}
                  </div>
                </div>
                {expanded.has(leak.id) ? (
                  <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />
                )}
              </div>
              {expanded.has(leak.id) && leak.summary && (
                <div className="px-4 pb-4 border-t border-[var(--border-subtle)]">
                  <pre className="text-caption text-[var(--text-secondary)] font-mono mt-3 whitespace-pre-wrap max-h-64 overflow-y-auto bg-[var(--bg-tertiary)] rounded-button p-3">
                    {leak.summary.slice(0, 1500)}
                    {leak.summary.length > 1500 ? "\n...[truncated]" : ""}
                  </pre>
                </div>
              )}
            </div>
          ))}
          {total > perPage && (
            <Pagination
              page={page}
              pages={pages}
              total={total}
              perPage={perPage}
              onPageChange={(p) => {
                setPage(p);
                fetchLeaks(p, sevFilter, domainFilter);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
