type Message = {
  id: number;
  text: string;
  sender: string;   // the name of whoever sent it
  isMe: boolean;    // was it sent by the current user?
};

type Props = {
  messages: Message[];
};

export default function MessageList({ messages }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 && (
        <p className="text-center text-gray-400 text-sm mt-10">
          No messages yet. Say hello!
        </p>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex flex-col ${msg.isMe ? "items-end" : "items-start"}`}
        >
          {/* Name label above the bubble */}
          <span className="text-xs text-gray-400 mb-1 px-1">
            {msg.isMe ? "" : msg.sender}
          </span>

          {/* Message bubble */}
          <div
            className={`max-w-xs px-4 py-2 rounded-2xl text-sm leading-relaxed ${
              msg.isMe
                ? "bg-blue-500 text-white rounded-br-sm"
                : "bg-gray-100 text-gray-800 rounded-bl-sm"
            }`}
          >
            {msg.text}
          </div>
        </div>
      ))}
    </div>
  );
}