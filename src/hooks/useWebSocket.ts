"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { LiveFeedItem } from "@/lib/types";

export function useWebSocket(maxItems: number = 50) {
  const [items, setItems] = useState<LiveFeedItem[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    const wsUrl = apiUrl.replace(/^https?:/, protocol);
    const ws = new WebSocket(`${wsUrl}/api/ws/live-feed`);

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_subdomain") {
          setItems((prev) => [data, ...prev].slice(0, maxItems));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 3 seconds
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;

    // Send pings every 25 seconds
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
    };
  }, [maxItems]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { items, connected };
}
