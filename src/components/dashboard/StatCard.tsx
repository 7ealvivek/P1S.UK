"use client";
import { cn, formatNumber } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
  icon?: React.ReactNode;
  accentColor?: string;
  trend?: { value: number; label: string };
  highlight?: boolean;
}

export function StatCard({ label, value, icon, accentColor, trend, highlight }: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-6",
        "transition-all duration-150 hover:bg-[var(--bg-tertiary)]",
        highlight && "ring-1 ring-[var(--color-accent)]"
      )}
      style={accentColor ? { borderLeft: `4px solid ${accentColor}` } : undefined}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-display tabular-nums text-[var(--text-primary)]">
            {formatNumber(value)}
          </div>
          <div className="text-caption text-[var(--text-secondary)] uppercase tracking-[0.02em] mt-1">
            {label}
          </div>
        </div>
        {icon && (
          <div className="text-[var(--text-tertiary)]">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-3">
          {trend.value >= 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-[var(--color-low)]" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-[var(--color-critical)]" />
          )}
          <span
            className={cn(
              "text-caption font-medium",
              trend.value >= 0 ? "text-[var(--color-low)]" : "text-[var(--color-critical)]"
            )}
          >
            {trend.value > 0 ? "+" : ""}{trend.value}%
          </span>
          <span className="text-caption text-[var(--text-tertiary)]">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
