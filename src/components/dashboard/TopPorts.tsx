"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PortData } from "@/lib/types";
import { chartColors, riskColors } from "@/lib/theme";

interface Props {
  data: PortData[];
}

export function TopPorts({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: `${d.port} (${d.service})`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Open Ports</CardTitle>
      </CardHeader>
      <div className="h-64">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[var(--text-tertiary)] text-body">
            No port data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 100 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: chartColors.text }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 12, fill: chartColors.text }}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  background: chartColors.bg,
                  border: `1px solid ${chartColors.grid}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={riskColors[entry.risk] || riskColors.standard} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
