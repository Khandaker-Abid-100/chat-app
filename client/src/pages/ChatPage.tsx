import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { apiGetMessages } from "../api";
import MessageList from "../MessageList";
import ChatBox from "../ChatBox";
import type {
  ClientMessage,
  MessagePayload,
  RoomPayload,
  ServerMessage,
} from "../../../shared/types";

type Props = {
  room: RoomPayload;
  onBack: () => void;
};

export default function ChatPage({ room, onBack }: Props) {
  const { auth } = useAuth();
  const [messages, setMessages] = useState<MessagePayload[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!auth) return;

    // Load message history for this room
    apiGetMessages(auth.token, room.id)
      .then(setMessages)
      .catch(console.error);

    const ws = new WebSocket(`ws://localhost:3001/ws?token=${auth.token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Tell server we joined this room
      const joinMsg: ClientMessage = { type: "join_room", roomId: room.id };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;

        if (msg.type === "new_message" && msg.message.roomId === room.id) {
          setMessages((prev) => [...prev, msg.message]);
        }

        if (msg.type === "seen_update") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.messageId ? { ...m, seenBy: msg.seenBy } : m
            )
          );
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);
    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, [auth, room.id]);

  function sendMessage(content: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: ClientMessage = {
      type: "send_message",
      roomId: room.id,
      content,
    };
    ws.send(JSON.stringify(msg));
  }

  function markRead(lastMessageId: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: ClientMessage = {
      type: "mark_read",
      roomId: room.id,
      lastMessageId,
    };
    ws.send(JSON.stringify(msg));
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-200 shadow-sm">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-100"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-gray-800">{room.name}</h1>
          <p className="text-xs text-gray-400">
            {connected ? "Connected" : "Connecting..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-yellow-400"}`} />
          <span className="text-sm text-gray-500">{auth?.user.username}</span>
        </div>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        myId={auth?.user.id ?? ""}
        onMessageVisible={markRead}
      />
      <div ref={bottomRef} />

      {/* Input */}
      <ChatBox onSend={sendMessage} />
    </div>
  );
}