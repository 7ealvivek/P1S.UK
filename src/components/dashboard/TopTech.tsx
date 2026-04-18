"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TechData } from "@/lib/types";
import { chartColors } from "@/lib/theme";

interface Props {
  data: TechData[];
}

export function TopTech({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Technologies</CardTitle>
      </CardHeader>
      <div className="h-64">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[var(--text-tertiary)] text-body">
            No tech data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 80 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: chartColors.text }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12, fill: chartColors.text }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: chartColors.bg,
                  border: `1px solid ${chartColors.grid}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="count"
                fill={chartColors.accent}
                radius={[0, 4, 4, 0]}
                barSize={16}
                fillOpacity={0.8}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
