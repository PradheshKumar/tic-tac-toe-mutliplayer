/**
 * gameService.js
 *
 * Low-level wrappers around the Nakama JS SDK for all game-related operations.
 * These functions are intentionally thin — they do the SDK call and return the
 * result. All business logic, error handling, and state management live in
 * useGame.js.
 *
 * Authentication strategy: Nakama device auth is used with a device ID derived
 * from the chosen username. This keeps onboarding frictionless (no password)
 * while still tying the session to a unique, persistent Nakama user account.
 */
import client, { useSSL } from "./nakamaClient";

/**
 * Authenticate with Nakama using a device ID derived from the username.
 * Nakama requires device IDs of at least 10 characters.
 */
export async function authenticate(username) {
  const deviceId = username.padEnd(10, "0");
  const session = await client.authenticateDevice(deviceId, true, username);
  return session;
}

/**
 * Create and connect a WebSocket to Nakama.
 */
export async function connectSocket(session) {
  const socket = client.createSocket(useSSL, false);
  await socket.connect(session, true);
  return socket;
}

/**
 * Call the find_match RPC to get or create a match.
 * Returns the matchId string.
 */
export async function findMatch(session) {
  const res = await client.rpc(session, "find_match", {});
  return res.payload.matchId;
}

/**
 * Join a match via the open socket.
 */
export async function joinMatch(socket, matchId) {
  return socket.joinMatch(matchId);
}

/**
 * Send a move intent to the server.
 * opCode 1 = player move.
 */
export function sendMove(socket, matchId, x, y) {
  socket.sendMatchState(matchId, 1, JSON.stringify({ x, y }));
}
