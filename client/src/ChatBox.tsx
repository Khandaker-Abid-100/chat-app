import { useState } from "react";

type Props = {
  onSend: (text: string) => void;
};

export default function ChatBox({ onSend }: Props) {
  const [text, setText] = useState("");

  function handleSend() {
    if (text.trim() === "") return;
    onSend(text);
    setText("");
  }

  return (
    <div className="flex items-center gap-2 p-3 border-t border-gray-200 bg-white">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        placeholder="Type a message..."
        className="flex-1 px-4 py-2 rounded-full border border-gray-300 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
      />
      <button
        onClick={handleSend}
        className="px-5 py-2 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-medium rounded-full transition"
      >
        Send
      </button>
    </div>
  );
}