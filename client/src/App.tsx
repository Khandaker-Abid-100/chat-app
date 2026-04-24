import { useState } from "react";
import { AuthProvider } from "./context/AuthProvider";
import { WsProvider } from "./context/WsProvider";
import { useAuth } from "./context/useAuth";
import { ErrorBoundary } from "./component/ErrorBoundary.tsx";
import AuthPage from "./pages/AuthPage";
import RoomListPage from "./pages/RoomListPage";
import ChatPage from "./pages/ChatPage";
import type { RoomPayload } from "../../shared/types";

function AppInner() {
  const { auth } = useAuth();
  const [activeRoom, setActiveRoom] = useState<RoomPayload | null>(null);

  if (!auth) return <AuthPage />;

  return (
    // Single WebSocket connection for the whole app
    <WsProvider token={auth.token}>
      <ErrorBoundary>
        {activeRoom ? (
          <ChatPage room={activeRoom} onBack={() => setActiveRoom(null)} />
        ) : (
          <RoomListPage onEnterRoom={setActiveRoom} />
        )}
      </ErrorBoundary>
    </WsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </AuthProvider>
  );
}