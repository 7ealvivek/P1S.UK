"use client";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown } from "lucide-react";

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  sort?: string;
  order?: "asc" | "desc";
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  compact?: boolean;
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns, data, sort, order, onSort, onRowClick, rowClassName, compact = false, className,
}: TableProps<T>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full">
        <thead>
          <tr className="bg-[var(--bg-tertiary)] border-b border-[var(--border-default)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "text-left text-caption font-medium text-[var(--text-secondary)] uppercase tracking-wider",
                  compact ? "px-3 py-2" : "px-4 py-3",
                  col.sortable && "cursor-pointer select-none hover:text-[var(--text-primary)]",
                  col.className
                )}
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && sort === col.key && (
                    order === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={idx}
  className={cn(
                "border-b border-[var(--border-subtle)] transition-colors duration-150",
                "hover:bg-[var(--bg-tertiary)]",
                onRowClick && "cursor-pointer",
                rowClassName?.(row)
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "text-body text-[var(--text-primary)]",
                    compact ? "px-3 py-2" : "px-4 py-3",
                    col.className
                  )}
                >
                  {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-center py-12 text-[var(--text-tertiary)]">
                No data found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
}

export function Pagination({ page, pages, total, perPage, onPageChange, onPerPageChange }: PaginationProps) {
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <div className="flex items-center justify-between py-3 px-4 border-t border-[var(--border-default)]">
      <span className="text-caption text-[var(--text-secondary)]">
        Showing {start}–{end} of {total.toLocaleString()} results
      </span>
      <div className="flex items-center gap-2">
        {onPerPageChange && (
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            className="bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-caption border border-[var(--border-default)] rounded-badge px-2 py-1"
          >
            {[50, 100, 250].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 text-caption rounded-button bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-colors"
        >
          Prev
        </button>
        <span className="text-caption text-[var(--text-secondary)]">
          {page} / {pages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="px-3 py-1 text-caption rounded-button bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
