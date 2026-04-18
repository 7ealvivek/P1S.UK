"use client";
import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, RiskBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { StatCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { PortSummary, RiskOverview } from "@/lib/types";
import { riskColors } from "@/lib/theme";
import { AlertTriangle, Shield, AlertCircle, Server } from "lucide-react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";

export default function PortsPage() {
  const [summary, setSummary] = useState<PortSummary[]>([]);
  const [risk, setRisk] = useState<RiskOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const [sumRes, riskRes] = await Promise.all([api.getPortSummary(), api.getPortRiskOverview()]);
        setSummary(sumRes.data as unknown as PortSummary[]);
        setRisk(riskRes.data as unknown as RiskOverview);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const dangerousPorts = summary.filter((p) => p.risk === "critical" || p.risk === "high");
  const hasDangerous = dangerousPorts.length > 0;

  // Heatmap data
  const heatmapData = summary.slice(0, 20).map((p) => ({
    name: `${p.port} (${p.service})`,
    count: p.count,
    risk: p.risk,
  }));

  return (
    <div>
      <Header title="Ports" description="Visual port analysis — find attack surface hot spots" />

      {/* Warning banner */}
      {hasDangerous && (
        <div className="mb-6 p-4 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] rounded-card flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--color-critical)]" />
          <span className="text-body text-[var(--text-primary)]">
            {dangerousPorts.reduce((s, p) => s + p.count, 0)} subdomains expose high-risk services
          </span>
        </div>
      )}

      {/* Risk Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading || !risk ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Critical Ports" value={risk.critical} accentColor="var(--color-critical)" icon={<AlertTriangle className="w-5 h-5" />} />
            <StatCard label="High Risk" value={risk.high} accentColor="var(--color-high)" icon={<AlertCircle className="w-5 h-5" />} />
            <StatCard label="Medium Risk" value={risk.medium} accentColor="var(--color-medium)" icon={<Shield className="w-5 h-5" />} />
            <StatCard label="Standard" value={risk.standard} accentColor="var(--text-tertiary)" icon={<Server className="w-5 h-5" />} />
          </>
        )}
      </div>

      {/* Treemap */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Port Heatmap</CardTitle>
        </CardHeader>
        {heatmapData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-[var(--text-tertiary)]">No port data yet</div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={heatmapData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 120 }}>
                <XAxis type="number" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickLine={false} axisLine={false} width={120} />
                <Tooltip contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                  {heatmapData.map((entry, i) => (
                    <Cell key={i} fill={riskColors[entry.risk] || riskColors.standard} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Port Table */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
        <div className="p-4 border-b border-[var(--border-default)]">
          <h3 className="text-heading text-[var(--text-primary)]">Port Inventory</h3>
        </div>
        {loading ? (
          <div className="p-4"><TableSkeleton rows={10} /></div>
        ) : (
          <DataTable
            columns={[
              { key: "port", label: "Port", className: "font-mono tabular-nums" },
              { key: "service", label: "Service" },
              {
                key: "risk",
                label: "Risk",
                render: (row) => <RiskBadge risk={String(row.risk)} />,
              },
              {
                key: "count",
                label: "Subdomains",
                className: "tabular-nums",
                render: (row) => <span className="font-medium">{(row.count as number).toLocaleString()}</span>,
              },
              {
                key: "percentage",
                label: "% of Total",
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, row.percentage as number)}%`,
                          backgroundColor: riskColors[row.risk as string] || riskColors.standard,
                        }}
                      />
                    </div>
                    <span className="text-caption tabular-nums">{(row.percentage as number).toFixed(1)}%</span>
                  </div>
                ),
              },
            ]}
            data={summary as unknown as Record<string, unknown>[]}
            onRowClick={(row) => router.push(`/subdomains?port=${row.port}`)}
          />
        )}
      </div>
    </div>
  );
}
