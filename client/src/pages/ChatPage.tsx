import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { apiGetMessages } from "../api";
import MessageList from "../MessageList";
import ChatBox from "../ChatBox";
import type { ClientMessage, MessagePayload, ServerMessage } from "../../../shared/types";

export default function ChatPage() {
  const { auth, logout } = useAuth();
  const [messages, setMessages] = useState<MessagePayload[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!auth) return;

    // Load history
    apiGetMessages(auth.token)
      .then((msgs) => {
        console.log("Loaded history:", msgs);
        setMessages(msgs);
      })
      .catch(console.error);

    // Connect WebSocket directly to Bun — no Vite proxy
    const ws = new WebSocket(`ws://localhost:3001/ws?token=${auth.token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected as", auth.user.username);
      setConnected(true);
    };

    ws.onmessage = (event) => {
      console.log("WS raw message received:", event.data);

      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        console.log("WS parsed message:", msg);

        if (msg.type === "new_message") {
          console.log("Adding new message to state:", msg.message);
          setMessages((prev) => [...prev, msg.message]);
        }

        if (msg.type === "seen_update") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.messageId ? { ...m, seenBy: msg.seenBy } : m
            )
          );
        }

        if (msg.type === "error") {
          console.error("Server WS error:", msg.message);
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err, event.data);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [auth]);

  function sendMessage(content: string) {
    const ws = wsRef.current;
    if (!ws) {
      console.error("No WebSocket reference");
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not open, readyState:", ws.readyState);
      return;
    }

    const msg: ClientMessage = { type: "send_message", content };
    const json = JSON.stringify(msg);
    console.log("Sending WS message:", json);
    ws.send(json);
  }

  function markRead(lastMessageId: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: ClientMessage = { type: "mark_read", lastMessageId };
    ws.send(JSON.stringify(msg));
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-200 shadow-sm">
        <div>
          <h1 className="text-base font-semibold text-gray-800">Chat Room</h1>
          <p className="text-xs text-gray-400">
            {connected ? "Connected" : "Connecting..."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-yellow-400"}`} />
            <span className="text-sm text-gray-600 font-medium">
              {auth?.user.username}
            </span>
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-500 transition px-2 py-1 rounded-lg hover:bg-red-50"
          >
            Sign out
          </button>
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