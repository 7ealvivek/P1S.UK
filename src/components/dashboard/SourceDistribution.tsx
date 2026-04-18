"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceData } from "@/lib/types";
import { sourceColors } from "@/lib/theme";
import { formatNumber } from "@/lib/utils";

interface Props {
  data: SourceData[];
}

export function SourceDistribution({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source Distribution</CardTitle>
      </CardHeader>
      <div className="flex items-center gap-4">
        <div className="w-48 h-48 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="source"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.source}
                    fill={sourceColors[entry.source] || sourceColors.unknown}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-heading tabular-nums text-[var(--text-primary)]">{formatNumber(total)}</span>
            <span className="text-caption text-[var(--text-tertiary)]">Total</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {data.map((entry) => (
            <div key={entry.source} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: sourceColors[entry.source] || sourceColors.unknown }}
                />
                <span className="text-body text-[var(--text-secondary)]">{entry.source}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-body tabular-nums text-[var(--text-primary)]">
                  {entry.count.toLocaleString()}
                </span>
                <span className="text-caption text-[var(--text-tertiary)] w-12 text-right">
                  {total > 0 ? Math.round((entry.count / total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
