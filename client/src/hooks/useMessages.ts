import { useEffect, useReducer } from "react";
import { apiGetMessages } from "../api";
import type { MessagePayload, ServerMessage } from "../../../shared/types";

type State = MessagePayload[];

type Action =
  | { type: "SET"; messages: MessagePayload[] }
  | { type: "APPEND"; message: MessagePayload }
  | { type: "UPDATE_SEEN"; messageId: string; seenBy: string[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET":
      return action.messages;
    case "APPEND":
      return [...state, action.message];
    case "UPDATE_SEEN":
      return state.map((m) =>
        m.id === action.messageId ? { ...m, seenBy: action.seenBy } : m
      );
    default:
      return state;
  }
}

export function useMessages(
  token: string | null,
  roomId: string,
  wsMessage: ServerMessage | null
) {
  const [messages, dispatch] = useReducer(reducer, []);

  // Load history when entering a room
  useEffect(() => {
    if (!token || !roomId) return;

    let cancelled = false;

    apiGetMessages(token, roomId)
      .then((msgs) => {
        if (!cancelled) dispatch({ type: "SET", messages: msgs });
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      dispatch({ type: "SET", messages: [] });
    };
  }, [token, roomId]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!wsMessage) return;

    if (
      wsMessage.type === "new_message" &&
      wsMessage.message.roomId === roomId
    ) {
      dispatch({ type: "APPEND", message: wsMessage.message });
    }

    if (wsMessage.type === "seen_update") {
      dispatch({
        type: "UPDATE_SEEN",
        messageId: wsMessage.messageId,
        seenBy: wsMessage.seenBy,
      });
    }
  }, [wsMessage, roomId]);

  return { messages };
}