"use client";
import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "critical" | "high" | "medium" | "low" | "info" | "accent" | "outline";
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
  critical: "bg-[rgba(239,68,68,0.1)] text-[var(--color-critical)]",
  high: "bg-[rgba(249,115,22,0.1)] text-[var(--color-high)]",
  medium: "bg-[rgba(234,179,8,0.1)] text-[var(--color-medium)]",
  low: "bg-[rgba(34,197,94,0.1)] text-[var(--color-low)]",
  info: "bg-[rgba(59,130,246,0.1)] text-[var(--color-info)]",
  accent: "bg-[rgba(99,102,241,0.1)] text-[var(--color-accent)]",
  outline: "border border-[var(--border-default)] text-[var(--text-secondary)]",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-caption font-medium whitespace-nowrap",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ code }: { code: number | null | undefined }) {
  if (!code) return <Badge variant="outline">N/A</Badge>;
  let variant: BadgeProps["variant"] = "default";
  if (code >= 200 && code < 300) variant = "low";
  else if (code >= 300 && code < 400) variant = "info";
  else if (code >= 400 && code < 500) variant = "medium";
  else if (code >= 500) variant = "critical";
  return <Badge variant={variant}>{code}</Badge>;
}

export function SourceBadge({ source }: { source: string }) {
  const variant = source === "ct_stream" ? "accent" : "info";
  return <Badge variant={variant}>{source}</Badge>;
}

export function RiskBadge({ risk }: { risk: string }) {
  const v = risk as BadgeProps["variant"];
  return <Badge variant={["critical", "high", "medium", "low", "info"].includes(risk) ? v : "default"}>{risk}</Badge>;
}
