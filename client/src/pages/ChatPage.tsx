import { useEffect, useRef } from "react";
import { useAuth } from "../context/useAuth";
import { useWs } from "../context/useWs";
import { useMessages } from "../hooks/useMessages";
import MessageList from "../MessageList";
import ChatBox from "../ChatBox";
import type { ClientMessage, RoomPayload } from "../../../shared/types";

type Props = {
  room: RoomPayload;
  onBack: () => void;
};

export default function ChatPage({ room, onBack }: Props) {
  const { auth } = useAuth();
  const { connected, send, lastMessage } = useWs();
  const { messages, hasMore, loadingMore, loadMore } = useMessages(
    auth?.token ?? null,
    room.id,
    lastMessage
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom only on first load and new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Scroll to bottom when a new real-time message arrives
  const prevLen = useRef(messages.length);
  useEffect(() => {
    const isNewMessage = messages.length > prevLen.current;
    prevLen.current = messages.length;
    if (isNewMessage) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Infinite scroll — watch the top sentinel element
  useEffect(() => {
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      {
        root: listRef.current,
        threshold: 0.1,
      }
    );

    if (topRef.current) observer.observe(topRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Tell the server we joined this room when connected
  useEffect(() => {
    if (!connected) return;
    const msg: ClientMessage = { type: "join_room", roomId: room.id };
    send(msg);
  }, [connected, room.id]);

  function sendMessage(content: string) {
    send({ type: "send_message", roomId: room.id, content });
  }

  function markRead(lastMessageId: string) {
    send({ type: "mark_read", roomId: room.id, lastMessageId });
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

      {/* Message list with scroll container */}
      <div ref={listRef} className="flex-1 overflow-y-auto">

        {/* Top sentinel — triggers loadMore when scrolled into view */}
        <div ref={topRef} className="h-1" />

        {/* Loading indicator */}
        {loadingMore && (
          <div className="flex justify-center py-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Load more button as fallback */}
        {hasMore && !loadingMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={loadMore}
              className="text-xs text-blue-500 hover:text-blue-600 px-4 py-1.5 rounded-full border border-blue-200 hover:bg-blue-50 transition"
            >
              Load older messages
            </button>
          </div>
        )}

        <MessageList
          messages={messages}
          myId={auth?.user.id ?? ""}
          onMessageVisible={markRead}
        />
        <div ref={bottomRef} />
      </div>

      <ChatBox onSend={sendMessage} />
    </div>
  );
}