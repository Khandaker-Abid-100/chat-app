import type { UserPayload } from "../../../shared/types";

export type AuthState = {
  user: UserPayload;
  token: string;
};

export type AuthContextType = {
  auth: AuthState | null;
  setAuth: (auth: AuthState | null) => void;
  logout: () => void;
};