"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { RefreshCw } from "lucide-react";

interface RiskScore {
  id: number;
  subdomain: string;
  root_domain: string;
  score: number;
  updated_at: string;
}

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

function scoreColor(score: number) {
  if (score >= 81) return { bar: "var(--color-critical)", text: "var(--color-critical)" };
  if (score >= 61) return { bar: "var(--color-high)", text: "var(--color-high)" };
  if (score >= 31) return { bar: "var(--color-medium)", text: "var(--color-medium)" };
  return { bar: "var(--color-low)", text: "var(--color-low)" };
}

export default function RiskPage() {
  const [items, setItems] = useState<RiskScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [minScore, setMinScore] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (minScore) params.set("min_score", minScore);
      const res = await api.fetch<any>(`/api/elite/risk-scores?${params}`);
      setItems((res as any).data || []);
    } catch {
      toast("Failed to load risk scores", "error");
    } finally {
      setLoading(false);
    }
  }, [minScore]);

  useEffect(() => { load(); }, [load]);

  const critical = items.filter((i) => i.score >= 81).length;
  const high = items.filter((i) => i.score >= 61 && i.score < 81).length;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Risk Scores"
        description="Asset risk scoring based on technology, vulnerabilities, and exposure"
        actions={
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{items.length}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Scored Assets</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-critical)]">{critical}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Critical (81-100)</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-high)]">{high}</div>
            <div className="text-caption text-[var(--text-tertiary)]">High (61-80)</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-medium)]">
              {items.length > 0 ? Math.round(items.reduce((a, i) => a + i.score, 0) / items.length) : 0}
            </div>
            <div className="text-caption text-[var(--text-tertiary)]">Avg Score</div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 items-center">
          <span className="text-caption text-[var(--text-tertiary)]">Min score:</span>
          <Input
            type="number"
            min="0"
            max="100"
            placeholder="0"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="w-24"
          />
          {["0", "30", "60", "80"].map((val) => (
            <button
              key={val}
              onClick={() => setMinScore(val === "0" ? "" : val)}
              className={`px-3 py-1.5 rounded-button text-caption font-medium border transition-all ${
                (val === "0" && !minScore) || minScore === val
                  ? "bg-[var(--bg-active)] border-[var(--color-accent)] text-[var(--text-primary)]"
                  : "bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {val === "0" ? "All" : `${val}+`}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-caption font-medium uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Subdomain</th>
                <th className="px-4 py-2.5 text-left">Risk Score</th>
                <th className="px-4 py-2.5 text-left">Root Domain</th>
                <th className="px-4 py-2.5 text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[var(--text-tertiary)]">
                    No risk scores calculated yet. Run a scan to generate scores.
                  </td>
                </tr>
              ) : items.map((item) => {
                const colors = scoreColor(item.score);
                return (
                  <tr key={item.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-caption text-[var(--text-secondary)] max-w-[250px] truncate">
                      {item.subdomain}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-body w-8" style={{ color: colors.text }}>
                          {item.score}
                        </span>
                        <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden max-w-[120px]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${item.score}%`, backgroundColor: colors.bar }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)]">
                      {item.root_domain}
                    </td>
                    <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)] whitespace-nowrap">
                      {fmt(item.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
