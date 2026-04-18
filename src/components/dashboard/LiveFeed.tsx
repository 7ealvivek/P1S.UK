"use client";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge, SourceBadge } from "@/components/ui/badge";
import { useWebSocket } from "@/hooks/useWebSocket";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function LiveFeed() {
  const { items, connected } = useWebSocket();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Live Activity</CardTitle>
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                connected ? "bg-[var(--color-low)] live-pulse" : "bg-[var(--color-high)]"
              )}
            />
            <span className="text-caption text-[var(--text-tertiary)]">
              {connected ? "Live" : "Reconnecting..."}
            </span>
          </div>
        </div>
      </CardHeader>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        <AnimatePresence initial={false}>
          {items.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-tertiary)] text-body">
              Waiting for new discoveries...
            </div>
          ) : (
            items.map((item, i) => (
              <motion.div
                key={`${item.subdomain}-${item.timestamp}-${i}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-between px-3 py-2 rounded-badge hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-mono text-[var(--text-primary)] truncate">
                    {item.subdomain}
                  </span>
                  <SourceBadge source={item.source} />
                  {item.status_code && <StatusBadge code={item.status_code} />}
                </div>
                <span className="text-caption text-[var(--text-tertiary)] whitespace-nowrap ml-2">
                  {timeAgo(item.timestamp)}
                </span>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
