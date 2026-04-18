"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { RefreshCw, Search } from "lucide-react";

interface CVEMatch {
  id: number;
  subdomain: string;
  root_domain: string;
  cve_id: string;
  description: string;
  severity: string;
  cvss: number;
  tech_detected: string;
  found_at: string;
  confirmed?: number;
}

type SevTab = "all" | "critical" | "high" | "medium";

function fmt(d: string) {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z");
  if (isNaN(dt.getTime())) return "—";
  const diff = Date.now() - dt.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function cvssColor(score: number) {
  if (score >= 9.0) return "var(--color-critical)";
  if (score >= 7.0) return "var(--color-high)";
  if (score >= 4.0) return "var(--color-medium)";
  return "var(--color-low)";
}

export default function CVEsPage() {
  const [items, setItems] = useState<CVEMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<SevTab>("all");
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== "all") params.set("severity", tab);
      if (search) params.set("search", search);
      const res = await api.fetch<any>(`/api/elite/cves?${params}`);
      setItems((res as any).data || []);
    } catch {
      toast("Failed to load CVEs", "error");
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  const total = items.length;
  const critical = items.filter((i) => i.severity === "critical").length;
  const uniqueCVEs = new Set(items.map((i) => i.cve_id)).size;

  const TABS: { id: SevTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "critical", label: "Critical" },
    { id: "high", label: "High" },
    { id: "medium", label: "Medium" },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="CVE Intelligence"
        description="Nuclei-confirmed CVEs from domain sweeps — zero false positives"
        actions={
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{total}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Total Matches</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-critical)]">{critical}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Critical CVEs</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-accent)]">{uniqueCVEs}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Unique CVE IDs</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-button text-caption font-medium border transition-all ${
                tab === t.id
                  ? "bg-[var(--bg-active)] border-[var(--color-accent)] text-[var(--text-primary)]"
                  : "bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            <Input
              placeholder="Search CVE, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-caption font-medium uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Source</th>
                <th className="px-4 py-2.5 text-left">Subdomain</th>
                <th className="px-4 py-2.5 text-left">CVE ID</th>
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-4 py-2.5 text-left">Severity</th>
                <th className="px-4 py-2.5 text-left">CVSS</th>
                <th className="px-4 py-2.5 text-left">Tech</th>
                <th className="px-4 py-2.5 text-left">Found</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[var(--text-tertiary)]">
                    No CVE matches yet. CVEs are confirmed by nuclei during domain sweeps — results appear automatically after sweeps run.
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id} className={`border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors ${item.confirmed ? "bg-[rgba(239,68,68,0.03)]" : ""}`}>
                  <td className="px-4 py-2.5">
                    {item.confirmed
                      ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[color-mix(in_srgb,var(--color-critical)_15%,transparent)] text-[var(--color-critical)] border border-[color-mix(in_srgb,var(--color-critical)_30%,transparent)]">✓ NUCLEI</span>
                      : <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">tech</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 font-mono text-caption text-[var(--text-secondary)] max-w-[180px] truncate">
                    {item.subdomain}
                  </td>
                  <td className="px-4 py-2.5">
                    <a
                      href={`https://nvd.nist.gov/vuln/detail/${item.cve_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-caption text-[var(--color-accent)] hover:underline"
                    >
                      {item.cve_id}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 text-caption text-[var(--text-secondary)] max-w-[240px] truncate" title={item.description}>
                    {item.description}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={
                      item.severity === "critical" ? "critical" :
                      item.severity === "high" ? "high" : "medium"
                    }>
                      {item.severity}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="font-mono font-bold text-caption"
                      style={{ color: cvssColor(item.cvss) }}
                    >
                      {item.cvss?.toFixed(1) || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-caption px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                      {item.tech_detected}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)] whitespace-nowrap">
                    {fmt(item.found_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
