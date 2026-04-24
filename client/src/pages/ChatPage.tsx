import { useEffect, useRef } from "react";
import { useAuth } from "../context/useAuth";
import { useWs } from "../context/useWs";
import { useMessages } from "../hooks/useMessages";
import MessageList from "../MessageList.tsx";
import ChatBox from "../ChatBox";
import type { ClientMessage, RoomPayload } from "../../../shared/types";

type Props = {
  room: RoomPayload;
  onBack: () => void;
};

export default function ChatPage({ room, onBack }: Props) {
  const { auth } = useAuth();
  const { connected, send, lastMessage } = useWs();
  const { messages } = useMessages(
    auth?.token ?? null,
    room.id,
    lastMessage
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Tell the server we joined this room when the page opens
  useEffect(() => {
    if (!connected) return;
    const msg: ClientMessage = { type: "join_room", roomId: room.id };
    send(msg);
  }, [connected, room.id]);

  function sendMessage(content: string) {
    const msg: ClientMessage = {
      type: "send_message",
      roomId: room.id,
      content,
    };
    send(msg);
  }

  function markRead(lastMessageId: string) {
    const msg: ClientMessage = {
      type: "mark_read",
      roomId: room.id,
      lastMessageId,
    };
    send(msg);
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
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

      <MessageList
        messages={messages}
        myId={auth?.user.id ?? ""}
        onMessageVisible={markRead}
      />
      <div ref={bottomRef} />
      <ChatBox onSend={sendMessage} />
    </div>
  );
}