import { AuthProvider } from "./context/AuthProvider";
import { useAuth } from "./context/useAuth";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";

function AppInner() {
  const { auth } = useAuth();
  return auth ? <ChatPage /> : <AuthPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}