import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { WsContext } from "./wsContext";
import { useWebSocketConn } from "../hooks/useWebSocketConn";
import type { ServerMessage } from "../../../shared/types";

export function WsProvider({
  token,
  children,
}: {
  token: string | null;
  children: ReactNode;
}) {
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);

  const handleMessage = useCallback((msg: ServerMessage) => {
    setLastMessage(msg);
  }, []);

  const { connected, send } = useWebSocketConn(token, handleMessage);

  return (
    <WsContext.Provider value={{ connected, send, lastMessage }}>
      {children}
    </WsContext.Provider>
  );
}