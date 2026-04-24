// All environment-specific config lives here.
// Components import from this file — never hardcode URLs directly.

export const WS_URL = import.meta.env.VITE_WS_URL as string;
export const API_URL = import.meta.env.VITE_API_URL as string;