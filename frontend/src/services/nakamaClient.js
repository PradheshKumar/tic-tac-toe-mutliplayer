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

// Single shared Nakama client instance used across the entire app
const client = new Client("defaultkey", "127.0.0.1", "7350", false);

export default client;
