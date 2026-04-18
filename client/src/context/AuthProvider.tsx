import { useState } from "react";
import type { ReactNode } from "react";
import { AuthContext } from "./AuthContext.tsx";
import type { AuthState } from "./types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthState | null>(() => {
    try {
      const stored = localStorage.getItem("chat_auth");
      return stored ? (JSON.parse(stored) as AuthState) : null;
    } catch {
      return null;
    }
  });

  function setAuth(next: AuthState | null) {
    setAuthState(next);
    if (next) {
      localStorage.setItem("chat_auth", JSON.stringify(next));
    } else {
      localStorage.removeItem("chat_auth");
    }
  }

  function logout() {
    setAuth(null);
  }

  return (
    <AuthContext.Provider value={{ auth, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}