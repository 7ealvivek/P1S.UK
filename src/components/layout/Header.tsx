"use client";
import { Search } from "lucide-react";

interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  onCommandPalette?: () => void;
}

export function Header({ title, description, actions, onCommandPalette }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-display text-[var(--text-primary)] tracking-[-0.01em]">{title}</h1>
        {description && (
          <p className="text-body text-[var(--text-secondary)] mt-1">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {onCommandPalette && (
          <button
            onClick={onCommandPalette}
            className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-button text-caption text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
            <kbd className="px-1.5 py-0.5 bg-[var(--bg-hover)] rounded text-[0.65rem]">⌘K</kbd>
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
