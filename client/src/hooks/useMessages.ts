import { useEffect, useReducer, useCallback } from "react";
import { apiGetMessages } from "../api";
import type { MessagePayload, ServerMessage } from "../../../shared/types";

type State = {
  messages: MessagePayload[];
  nextCursor: string | null;
  loadingMore: boolean;
  hasMore: boolean;
};

type Action =
  | { type: "SET_INITIAL"; messages: MessagePayload[]; nextCursor: string | null }
  | { type: "PREPEND"; messages: MessagePayload[]; nextCursor: string | null }
  | { type: "APPEND"; message: MessagePayload }
  | { type: "UPDATE_SEEN"; messageId: string; seenBy: string[] }
  | { type: "SET_LOADING_MORE"; value: boolean }
  | { type: "RESET" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_INITIAL":
      return {
        messages: action.messages,
        nextCursor: action.nextCursor,
        hasMore: action.nextCursor !== null,
        loadingMore: false,
      };

    case "PREPEND":
      // Older messages loaded via infinite scroll — add to top
      return {
        ...state,
        messages: [...action.messages, ...state.messages],
        nextCursor: action.nextCursor,
        hasMore: action.nextCursor !== null,
        loadingMore: false,
      };

    case "APPEND":
      return {
        ...state,
        messages: [...state.messages, action.message],
      };

    case "UPDATE_SEEN":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId
            ? { ...m, seenBy: action.seenBy }
            : m
        ),
      };

    case "SET_LOADING_MORE":
      return { ...state, loadingMore: action.value };

    case "RESET":
      return {
        messages: [],
        nextCursor: null,
        hasMore: false,
        loadingMore: false,
      };

    default:
      return state;
  }
}

const initialState: State = {
  messages: [],
  nextCursor: null,
  hasMore: false,
  loadingMore: false,
};

export function useMessages(
  token: string | null,
  roomId: string,
  wsMessage: ServerMessage | null
) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load most recent messages when entering a room
  useEffect(() => {
    if (!token || !roomId) return;

    let cancelled = false;

    apiGetMessages(token, roomId)
      .then(({ messages, nextCursor }) => {
        if (!cancelled) {
          dispatch({ type: "SET_INITIAL", messages, nextCursor });
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      dispatch({ type: "RESET" });
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

  // Load older messages — called when user scrolls to the top
  const loadMore = useCallback(async () => {
    if (!token || !state.nextCursor || state.loadingMore) return;

    dispatch({ type: "SET_LOADING_MORE", value: true });

    try {
      const { messages, nextCursor } = await apiGetMessages(
        token,
        roomId,
        state.nextCursor
      );
      dispatch({ type: "PREPEND", messages, nextCursor });
    } catch (err) {
      console.error("Failed to load more messages:", err);
      dispatch({ type: "SET_LOADING_MORE", value: false });
    }
  }, [token, roomId, state.nextCursor, state.loadingMore]);

  return {
    messages: state.messages,
    hasMore: state.hasMore,
    loadingMore: state.loadingMore,
    loadMore,
  };
}