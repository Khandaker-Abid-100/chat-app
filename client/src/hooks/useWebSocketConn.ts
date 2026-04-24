import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WS_URL } from "../config";
import type { ClientMessage, ServerMessage } from "../../../shared/types";

type MessageHandler = (msg: ServerMessage) => void;

export function useWebSocketConn(
  token: string | null,
  onMessage: MessageHandler
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef<MessageHandler>(onMessage);

  useLayoutEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (!token) return;
    const timeoutId = setTimeout(() => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        const authMsg: ClientMessage = { type: "auth", token };
        ws.send(JSON.stringify(authMsg));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          if (msg.type === "auth_ok") {
            setConnected(true);
          }
          onMessageRef.current(msg);
        } catch (err) {
          console.error("WS parse error:", err);
        }
      };

      ws.onerror = (err) => console.error("WS error:", err);
      ws.onclose = () => setConnected(false);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setConnected(false);
      }
    };
  }, [token]);

  function send(msg: ClientMessage) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  return { connected, send };
}