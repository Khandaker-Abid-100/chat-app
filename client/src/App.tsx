import { useEffect, useRef, useState } from "react";
import JoinScreen from "./JoinScreen";
import MessageList from "./MessageList";
import ChatBox from "./ChatBox";

type Message = {
  id: number;
  text: string;
  sender: string;
  isMe: boolean;
};

export default function App() {
  const [myName, setMyName] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!myName) return;

    const ws = new WebSocket("ws://localhost:5173/ws");
    wsRef.current = ws;

    ws.onopen = () => console.log("Connected as", myName);

    ws.onmessage = (event) => {
      const raw = event.data as string;

      // Messages are sent in the format:  "Name: message text"
      const colonIndex = raw.indexOf(": ");
      const sender = colonIndex !== -1 ? raw.slice(0, colonIndex) : "Unknown";
      const text = colonIndex !== -1 ? raw.slice(colonIndex + 2) : raw;

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text,
          sender,
          isMe: sender === myName,
        },
      ]);
    };

    ws.onclose = () => console.log("Disconnected.");

    return () => ws.close();
  }, [myName]);

  function sendMessage(text: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Send format:  "Alice: hello there"
    ws.send(`${myName}: ${text}`);
  }

  // Show join screen first
  if (!myName) {
    return <JoinScreen onJoin={setMyName} />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-200 shadow-sm">
        <div>
          <h1 className="text-base font-semibold text-gray-800">Chat Room</h1>
          <p className="text-xs text-gray-400">Everyone can see your messages</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
          <span className="text-sm text-gray-600 font-medium">{myName}</span>
        </div>
      </div>

      {/* Messages */}
      <MessageList messages={messages} />

      {/* Invisible anchor for auto-scroll */}
      <div ref={bottomRef} />

      {/* Input bar */}
      <ChatBox onSend={sendMessage} />
    </div>
  );
}