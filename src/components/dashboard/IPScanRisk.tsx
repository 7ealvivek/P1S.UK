"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldAlert, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

function getAuthHeader() {
  return { Authorization: `Bearer ${localStorage.getItem("p1w_token")}` };
}

const RISK_STYLE: Record<string, { bar: string; text: string; badge: string }> = {
  critical: { bar: "bg-red-500", text: "text-red-400", badge: "bg-red-500/15 text-red-400 border border-red-500/30" },
  high:     { bar: "bg-orange-500", text: "text-orange-400", badge: "bg-orange-500/15 text-orange-400 border border-orange-500/30" },
  medium:   { bar: "bg-yellow-500", text: "text-yellow-400", badge: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" },
  standard: { bar: "bg-blue-500", text: "text-blue-400", badge: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
};

interface RiskRow { risk: string; count: number }
interface Finding { id: number; ip: string; port: number; hostname: string; reason: string; risk: string; root_domain: string }

export function IPScanRisk() {
  const [byRisk, setByRisk] = useState<RiskRow[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [total, setTotal] = useState(0);
  const [uniqueIPs, setUniqueIPs] = useState(0);

  useEffect(() => {
    const h = getAuthHeader();
    Promise.all([
      fetch("/api/ipscan/stats", { headers: h }).then(r => r.json()),
      fetch("/api/ipscan/results?per_page=6", { headers: h }).then(r => r.json()),
    ]).then(([statsRes, resultsRes]) => {
      setByRisk(statsRes.data?.by_risk || []);
      setTotal(statsRes.data?.total || 0);
      setUniqueIPs(statsRes.data?.unique_ips || 0);
      setFindings(resultsRes.data || []);
    }).catch(() => {});
  }, []);

  const maxCount = Math.max(...byRisk.map(r => r.count), 1);
  const critical = byRisk.find(r => r.risk === "critical")?.count ?? 0;
  const high = byRisk.find(r => r.risk === "high")?.count ?? 0;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <CardTitle>IP Scan Exposure</CardTitle>
          </div>
          <Link href="/ipscan" className="text-caption text-[var(--color-accent)] hover:underline">View all →</Link>
        </div>
        <div className="flex gap-3 mt-2">
          <div className="text-center">
            <div className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{uniqueIPs.toLocaleString()}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Unique IPs</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{total.toLocaleString()}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Open Ports</div>
          </div>
          {critical > 0 && (
            <div className="text-center">
              <div className="text-xl font-bold tabular-nums text-red-400">{critical}</div>
              <div className="text-caption text-[var(--text-tertiary)]">Critical</div>
            </div>
          )}
          {high > 0 && (
            <div className="text-center">
              <div className="text-xl font-bold tabular-nums text-orange-400">{high}</div>
              <div className="text-caption text-[var(--text-tertiary)]">High</div>
            </div>
          )}
        </div>
      </CardHeader>

      {/* Risk bars */}
      <div className="px-4 pb-3 space-y-2">
        {byRisk.map(r => {
          const s = RISK_STYLE[r.risk] || RISK_STYLE.standard;
          return (
            <div key={r.risk} className="flex items-center gap-2">
              <span className={`text-caption capitalize w-14 shrink-0 ${s.text}`}>{r.risk}</span>
              <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${(r.count / maxCount) * 100}%` }} />
              </div>
              <span className="text-caption text-[var(--text-tertiary)] w-10 text-right tabular-nums">{r.count}</span>
            </div>
          );
        })}
      </div>

      {/* Top findings */}
      {findings.length > 0 && (
        <div className="px-4 pb-4 flex-1 overflow-hidden">
          <div className="text-caption text-[var(--text-tertiary)] mb-2 font-medium uppercase tracking-wide">Top Findings</div>
          <div className="space-y-1.5">
            {findings.map(f => {
              const s = RISK_STYLE[f.risk] || RISK_STYLE.standard;
              return (
                <div key={f.id} className="flex items-center gap-2 group">
                  <span className={`text-caption px-1.5 py-0.5 rounded capitalize shrink-0 ${s.badge}`}>{f.risk}</span>
                  <span className="font-mono text-caption text-[var(--text-primary)] shrink-0">{f.ip}:{f.port}</span>
                  <span className="text-caption text-[var(--text-tertiary)] truncate flex-1">{f.reason || f.hostname}</span>
                  <a href={`http://${f.ip}:${f.port}`} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--color-accent)] transition-all">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
