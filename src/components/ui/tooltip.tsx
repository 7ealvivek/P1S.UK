"use client";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [show, setShow] = useState(false);
  const timeout = useRef<NodeJS.Timeout>();

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => {
        timeout.current = setTimeout(() => setShow(true), 300);
      }}
      onMouseLeave={() => {
        clearTimeout(timeout.current);
        setShow(false);
      }}
    >
      {children}
      {show && (
        <div
          className={cn(
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
            "bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-caption",
            "px-2 py-1 rounded-badge border border-[var(--border-default)]",
            "whitespace-nowrap shadow-lg animate-fade-in",
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
