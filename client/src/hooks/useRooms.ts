import { useEffect, useReducer } from "react";
import { apiGetRooms, apiCreateRoom } from "../api";
import type { RoomPayload, ServerMessage } from "../../../shared/types";

type State = RoomPayload[];

type Action =
  | { type: "SET"; rooms: RoomPayload[] }
  | { type: "ADD"; room: RoomPayload }
  | { type: "INCREMENT_UNREAD"; roomId: string }
  | { type: "CLEAR_UNREAD"; roomId: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET":
      return action.rooms;

    case "ADD": {
      const exists = state.some((r) => r.id === action.room.id);
      if (exists) return state;
      return [...state, action.room];
    }

    case "INCREMENT_UNREAD":
      return state.map((r) =>
        r.id === action.roomId
          ? { ...r, unreadCount: r.unreadCount + 1 }
          : r
      );

    case "CLEAR_UNREAD":
      return state.map((r) =>
        r.id === action.roomId ? { ...r, unreadCount: 0 } : r
      );

    default:
      return state;
  }
}

export function useRooms(
  token: string | null,
  userId: string | null,
  wsMessage: ServerMessage | null
) {
  const [rooms, dispatch] = useReducer(reducer, []);

  useEffect(() => {
    if (!token) return;
    apiGetRooms(token)
      .then((rooms) => dispatch({ type: "SET", rooms }))
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!wsMessage) return;

    if (wsMessage.type === "room_created") {
      dispatch({ type: "ADD", room: wsMessage.room });
    }

    if (wsMessage.type === "new_message" && userId) {
      if (wsMessage.message.senderId !== userId) {
        dispatch({
          type: "INCREMENT_UNREAD",
          roomId: wsMessage.message.roomId,
        });
      }
    }
  }, [wsMessage, userId]);

  async function createRoom(name: string): Promise<void> {
    if (!token) return;
    await apiCreateRoom(token, name);
  }

  // Just clears the unread badge locally — actual DB join
  // happens via apiJoinByCode or apiAcceptInvitation at the page level
  function joinRoom(room: RoomPayload): void {
    dispatch({ type: "CLEAR_UNREAD", roomId: room.id });
  }

  function addRoom(room: RoomPayload): void {
    dispatch({ type: "ADD", room });
  }

  return { rooms, createRoom, joinRoom, addRoom };
}