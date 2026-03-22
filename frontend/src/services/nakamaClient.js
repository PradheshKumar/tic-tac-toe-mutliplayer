/**
 * nakamaClient.js
 *
 * Creates and exports a single shared Nakama JS SDK client instance.
 * All services (gameService, leaderboardService) import this same instance
 * so there is never more than one connection pool open at a time.
 *
 * Configuration:
 *   serverKey  — must match the Nakama server's `--name` / console key ("defaultkey" locally)
 *   host       — Nakama server hostname or IP (update for production)
 *   port       — Nakama HTTP/WebSocket port (default 7350)
 *   useSSL     — set to true and use port 443 when deploying behind TLS
 */
import { Client } from "@heroiclabs/nakama-js";

// Single shared Nakama client instance used across the entire app.
// All values come from environment variables (prefixed with VITE_ for Vite's
// build-time injection). Copy frontend/.env.sample → frontend/.env and fill in
// your values before running locally or deploying.
// Export the SSL flag separately so gameService can pass it to createSocket().
// createSocket(useSSL) controls ws:// vs wss:// — it must match the HTTP SSL setting.
export const useSSL = import.meta.env.VITE_NAKAMA_SSL === "true";

const client = new Client(
  import.meta.env.VITE_NAKAMA_KEY  ?? "defaultkey",
  import.meta.env.VITE_NAKAMA_HOST ?? "127.0.0.1",
  import.meta.env.VITE_NAKAMA_PORT ?? "7350",
  useSSL,
);

export default client;
