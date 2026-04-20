import { useState } from "react";
import { AuthProvider } from "./context/AuthProvider";
import { useAuth } from "./context/useAuth";
import AuthPage from "./pages/AuthPage";
import RoomListPage from "./pages/RoomListPage";
import ChatPage from "./pages/ChatPage";
import type { RoomPayload } from "../../shared/types";

function AppInner() {
  const { auth } = useAuth();
  const [activeRoom, setActiveRoom] = useState<RoomPayload | null>(null);

  if (!auth) return <AuthPage />;

  if (activeRoom) {
    return (
      <ChatPage
        room={activeRoom}
        onBack={() => setActiveRoom(null)}
      />
    );
  }

  return <RoomListPage onEnterRoom={setActiveRoom} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}