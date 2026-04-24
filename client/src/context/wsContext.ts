import { createContext } from "react";
import type { ClientMessage, ServerMessage } from "../../../shared/types";

export type WsContextType = {
  connected: boolean;
  send: (msg: ClientMessage) => void;
  lastMessage: ServerMessage | null;
};

export const WsContext = createContext<WsContextType | null>(null);