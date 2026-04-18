"use client";
import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { chartColors } from "@/lib/theme";
import { TimelinePoint } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  data: TimelinePoint[];
  onPeriodChange: (period: string) => void;
}

const periods = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export function DiscoveryTimeline({ data, onPeriodChange }: Props) {
  const [active, setActive] = useState("7d");

  const handlePeriod = (p: string) => {
    setActive(p);
    onPeriodChange(p);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discovery Timeline</CardTitle>
        <div className="flex gap-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriod(p.value)}
              className={cn(
                "px-3 py-1 rounded-badge text-caption font-medium transition-colors",
                active === p.value
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.text} stopOpacity={0.1} />
                <stop offset="95%" stopColor={chartColors.text} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="newGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.accent} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartColors.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} strokeOpacity={0.5} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: chartColors.text }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                if (active === "24h") return v.split(" ")[1] || v;
                return v.split("-").slice(1).join("/");
              }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: chartColors.text }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: chartColors.bg,
                border: `1px solid ${chartColors.grid}`,
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: chartColors.text }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={chartColors.text}
              strokeWidth={1.5}
              fill="url(#totalGrad)"
              name="Total"
            />
            <Area
              type="monotone"
              dataKey="new_count"
              stroke={chartColors.accent}
              strokeWidth={2}
              fill="url(#newGrad)"
              name="New"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
