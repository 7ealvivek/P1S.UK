"use client";
import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  accentColor?: string;
}

export function Card({ children, className, hover = false, onClick, accentColor }: CardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-6",
        "transition-all duration-150",
        hover && "hover:bg-[var(--bg-tertiary)] cursor-pointer",
        onClick && "cursor-pointer",
        className
      )}
      style={accentColor ? { borderLeft: `4px solid ${accentColor}` } : undefined}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-heading text-[var(--text-primary)]", className)}>
      {children}
    </h3>
  );
}
