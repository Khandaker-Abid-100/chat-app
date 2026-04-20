import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { apiGetRooms, apiCreateRoom, apiJoinRoom } from "../api";
import type { RoomPayload, ServerMessage } from "../../../shared/types";

type Props = {
  onEnterRoom: (room: RoomPayload) => void;
};

export default function RoomListPage({ onEnterRoom }: Props) {
  const { auth, logout } = useAuth();
  const [rooms, setRooms] = useState<RoomPayload[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Load initial room list
  useEffect(() => {
    if (!auth) return;
    apiGetRooms(auth.token).then(setRooms).catch(console.error);
  }, [auth]);

  // Open WebSocket to receive real-time room_created events
  useEffect(() => {
    if (!auth) return;

    const ws = new WebSocket(`ws://localhost:3001/ws?token=${auth.token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;

        if (msg.type === "room_created") {
          // Add new room to list only if it's not already there
          setRooms((prev) => {
            const exists = prev.some((r) => r.id === msg.room.id);
            if (exists) return prev;
            return [...prev, msg.room];
          });
        }

        if (msg.type === "new_message") {
          // Increment unread count for rooms the user is not currently in
          setRooms((prev) =>
            prev.map((r) =>
              r.id === msg.message.roomId &&
              msg.message.senderId !== auth.user.id
                ? { ...r, unreadCount: r.unreadCount + 1 }
                : r
            )
          );
        }
      } catch (err) {
        console.error("WS parse error:", err);
      }
    };

    ws.onerror = (err) => console.error("RoomList WS error:", err);

    return () => ws.close();
  }, [auth]);

  async function handleCreate() {
    if (!auth || !newRoomName.trim()) return;
    setError("");
    setLoading(true);
    try {
      // Server will broadcast room_created to all clients including us
      // so we don't manually push to setRooms here — the WS handler does it
      await apiCreateRoom(auth.token, newRoomName.trim());
      setNewRoomName("");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinAndEnter(room: RoomPayload) {
    if (!auth) return;
    try {
      await apiJoinRoom(auth.token, room.id);
      setRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, unreadCount: 0 } : r))
      );
      onEnterRoom(room);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-base font-semibold text-gray-800">Chat Rooms</h1>
          <p className="text-xs text-gray-400">
            Welcome, {auth?.user.username}
          </p>
        </div>
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition"
        >
          Sign out
        </button>
      </div>

      <div className="flex-1 max-w-lg w-full mx-auto p-4 flex flex-col gap-4">

        {/* Create room */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Create a new room
          </p>
          {error && (
            <div className="bg-red-50 text-red-500 text-xs rounded-lg px-3 py-2 mb-3">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Room name..."
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            />
            <button
              onClick={handleCreate}
              disabled={loading || !newRoomName.trim()}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-xl transition"
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </div>

        {/* Room list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <p className="text-sm font-medium text-gray-700 px-4 pt-4 pb-2">
            Available rooms
          </p>
          {rooms.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No rooms yet. Create one above.
            </p>
          ) : (
            <ul>
              {rooms.map((room, i) => (
                <li
                  key={room.id}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition ${
                    i !== rooms.length - 1 ? "border-b border-gray-100" : ""
                  }`}
                  onClick={() => handleJoinAndEnter(room)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                      {room.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {room.name}
                      </p>
                      <p className="text-xs text-gray-400">Click to join</p>
                    </div>
                  </div>

                  {/* Unread badge */}
                  {room.unreadCount > 0 && (
                    <span className="bg-blue-500 text-white text-xs font-semibold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                      {room.unreadCount}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}