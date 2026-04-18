import { useEffect, useRef } from "react";
import type { MessagePayload } from "../../shared/types";

type Props = {
  messages: MessagePayload[];
  myId: string;
  onMessageVisible: (lastMessageId: string) => void;
};

export default function MessageList({ messages, myId, onMessageVisible }: Props) {
  const lastIdRef = useRef<string | null>(null);

  // When the last message changes and it's not mine, mark it read
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.id === lastIdRef.current) return;
    if (last.senderId !== myId) {
      lastIdRef.current = last.id;
      onMessageVisible(last.id);
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No messages yet. Say hello!
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => {
        const isMe = msg.senderId === myId;

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
          >
            {/* Sender name */}
            <span className="text-xs text-gray-400 mb-1 px-1">
              {isMe ? "You" : msg.senderName}
            </span>

            {/* Bubble */}
            <div
              className={`max-w-xs px-4 py-2 rounded-2xl text-sm leading-relaxed ${
                isMe
                  ? "bg-blue-500 text-white rounded-br-sm"
                  : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"
              }`}
            >
              {msg.content}
            </div>

            {/* Seen indicator — only show under your own messages */}
            {isMe && msg.seenBy.length > 0 && (
              <span className="text-xs text-gray-400 mt-1 px-1">
                Seen by {msg.seenBy.filter((n) => n !== msg.senderName).join(", ")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}