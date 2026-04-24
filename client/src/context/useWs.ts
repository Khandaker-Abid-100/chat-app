import { useContext } from "react";
import { WsContext } from "./wsContext";
import type { WsContextType } from "./wsContext";

export function useWs(): WsContextType {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWs must be used inside <WsProvider>");
  return ctx;
}