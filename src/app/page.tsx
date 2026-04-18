"use client";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { DiscoveryTimeline } from "@/components/dashboard/DiscoveryTimeline";
import { IPScanRisk } from "@/components/dashboard/IPScanRisk";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { TopTech } from "@/components/dashboard/TopTech";
import { TopPorts } from "@/components/dashboard/TopPorts";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/hooks/useDashboard";
import { Globe, Sparkles, Server, Network, Cpu, Camera } from "lucide-react";
import { timeAgo, formatDuration } from "@/lib/utils";
import Link from "next/link";

export default function DashboardPage() {
  const { stats, timeline, topTech, topPorts, recentScans, loading, refreshTimeline } = useDashboard();

  return (
    <div>
      <Header title="Dashboard" description="Attack surface overview and real-time monitoring" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {loading || !stats ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Total Subdomains" value={stats.total} icon={<Globe className="w-5 h-5" />} accentColor="var(--color-accent)" />
            <StatCard label="New (24h)" value={stats.new} icon={<Sparkles className="w-5 h-5" />} accentColor="var(--color-accent)" highlight={stats.new > 0} />
            <StatCard label="Monitored Domains" value={stats.domains} icon={<Server className="w-5 h-5" />} accentColor="var(--color-info)" />
            <StatCard label="With Open Ports" value={stats.with_ports} icon={<Network className="w-5 h-5" />} accentColor="var(--color-high)" />
            <StatCard label="With Tech Detected" value={stats.with_tech} icon={<Cpu className="w-5 h-5" />} accentColor="var(--color-medium)" />
            <StatCard label="Screenshots" value={stats.with_screenshots} icon={<Camera className="w-5 h-5" />} accentColor="var(--color-low)" />
          </>
        )}
      </div>

      {/* Timeline + Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
        <div className="lg:col-span-3">
          {loading ? <ChartSkeleton /> : <DiscoveryTimeline data={timeline} onPeriodChange={(p) => refreshTimeline(p)} />}
        </div>
        <div className="lg:col-span-2">
          <IPScanRisk />
        </div>
      </div>

      {/* Live Feed + Tech + Ports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <LiveFeed />
        <div className="grid grid-cols-1 gap-4">
          <TopTech data={topTech} />
          <TopPorts data={topPorts} />
        </div>
      </div>

      {/* Recent Scans */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)]">
          <h3 className="text-heading text-[var(--text-primary)]">Recent Scans</h3>
          <Link href="/scans" className="text-caption text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors">
            View all →
          </Link>
        </div>
        <DataTable
          columns={[
            {
              key: "scan_type",
              label: "Type",
              render: (row) => <Badge variant="accent">{String(row.scan_type)}</Badge>,
            },
            { key: "target", label: "Target", className: "font-mono" },
            {
              key: "started_at",
              label: "Started",
              render: (row) => <span className="text-[var(--text-secondary)]">{timeAgo(String(row.started_at))}</span>,
            },
            {
              key: "duration_seconds",
              label: "Duration",
              render: (row) => <span>{formatDuration(row.duration_seconds as number | null)}</span>,
            },
            {
              key: "new_count",
              label: "New",
              render: (row) => {
                const n = row.new_count as number;
                return <span className={n > 0 ? "text-[var(--color-accent)] font-medium" : ""}>{n}</span>;
              },
            },
            { key: "total_count", label: "Total" },
          ]}
          data={recentScans as unknown as Record<string, unknown>[]}
          compact
        />
      </div>
    </div>
  );
}
