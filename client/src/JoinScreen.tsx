import { useState } from "react";

type Props = {
  onJoin: (name: string) => void;
};

export default function JoinScreen({ onJoin }: Props) {
  const [name, setName] = useState("");

  function handleJoin() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    onJoin(trimmed);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">

        {/* Icon */}
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M21 16a2 2 0 01-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-800 text-center mb-1">
          Welcome to Chat
        </h1>
        <p className="text-sm text-gray-400 text-center mb-6">
          Enter your name to join the room
        </p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Your name..."
          maxLength={20}
          autoFocus
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition mb-4"
        />

        <button
          onClick={handleJoin}
          disabled={name.trim() === ""}
          className="w-full py-3 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-xl transition text-sm"
        >
          Join Room
        </button>
      </div>
    </div>
  );
}