# Chat App — Client

React + TypeScript + Vite + Tailwind CSS frontend for the real-time chat app.

---

## Prerequisites

Install Bun if you don't have it:

```bash
curl -fsSL https://bun.sh/install | bash
```

---

## Project setup from scratch

### 1. Create the Vite + React + TypeScript project

```bash
mkdir client
cd client
bun create vite@latest . --template react-ts
```

> The `.` creates the project in the current folder. Press **Y** if it asks to overwrite.

### 2. Install Tailwind CSS

```bash
bun add -d tailwindcss @tailwindcss/vite
```

---

## Configuration

### `vite.config.ts` — register Tailwind and add WebSocket proxy

Replace the entire file:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
});
```

### `src/index.css` — enable Tailwind

Delete everything in this file and add only:

```css
@import "tailwindcss";
```

---

## Project structure

```
client/
├── src/
│   ├── App.tsx            # Root — state, WebSocket logic, layout
│   ├── JoinScreen.tsx     # Name entry screen
│   ├── MessageList.tsx    # Chat bubbles
│   ├── ChatBox.tsx        # Input bar
│   ├── main.tsx           # React entry point
│   └── index.css          # @import "tailwindcss"
├── vite.config.ts
└── package.json
```

---

## Running the app

> Make sure the server is running first (`cd ../server && bun dev`).

```bash
bun run dev
```

Open `http://localhost:5173` in your browser.

---

## Scripts

```bash
bun run dev       # start dev server at localhost:5173
bun run build     # build for production into dist/
bun run preview   # preview the production build
```