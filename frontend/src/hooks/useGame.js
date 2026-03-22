/**
 * useGame.js
 *
 * Custom hook that exposes all game-related actions to UI components.
 * It bridges the GameContext state (pure data) with the Nakama services
 * (side effects: network calls, WebSocket messaging).
 *
 * Exported actions:
 *   login(username)  — authenticate with Nakama and open a WebSocket
 *   play()           — call find_match RPC then join the returned match
 *   makeMove(x, y)   — send a move intent to the server over the socket
 *   playAgain()      — dispatch PLAY_AGAIN to reset state and go back to lobby
 *
 * Error handling: errors are stored in global state and auto-cleared after
 * ERROR_CLEAR_DELAY ms so the UI shows transient toast-style messages.
 */
import { useCallback, useRef } from "react";
import { useGameContext } from "../context/GameContext";
import {
  authenticate,
  connectSocket,
  findMatch,
  joinMatch,
  sendMove,
} from "../services/gameService";

const ERROR_CLEAR_DELAY = 4000;

export function useGame() {
  const { state, dispatch, socketRef } = useGameContext();
  const errorTimerRef = useRef(null);

  function showError(message) {
    dispatch({ type: "SET_ERROR", message });
    clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(
      () => dispatch({ type: "CLEAR_ERROR" }),
      ERROR_CLEAR_DELAY
    );
  }

  // ─── Attach match data listener ────────────────────────────────────────────
  function attachMatchListener(socket) {
    socket.onmatchdata = (matchState) => {
      try {
        const raw = new TextDecoder().decode(matchState.data);
        const gameState = JSON.parse(raw);
        const opCode = matchState.op_code ?? matchState.opCode;
        dispatch({ type: "GAME_UPDATE", gameState, opCode });
      } catch {
        showError("Something went wrong — game state could not be parsed.");
      }
    };

    // Handle opponent disconnection at the socket level
    socket.onmatchpresence = () => {};
  }

  // ─── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (username) => {
      try {
        dispatch({ type: "CLEAR_ERROR" });
        const session = await authenticate(username);
        const socket = await connectSocket(session);
        socketRef.current = socket;
        attachMatchListener(socket);
        dispatch({ type: "AUTH_SUCCESS", session, socket });
      } catch (err) {
        showError(err.message || "Authentication failed. Please try again.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, socketRef]
  );

  // ─── Find / join match ─────────────────────────────────────────────────────
  const play = useCallback(
    async () => {
      try {
        dispatch({ type: "CLEAR_ERROR" });
        const matchId = await findMatch(state.session);
        await joinMatch(socketRef.current, matchId);
        dispatch({ type: "MATCH_JOINED", matchId });
      } catch (err) {
        showError(err.message || "Failed to find a match. Please try again.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.session, dispatch, socketRef]
  );

  // ─── Make a move ───────────────────────────────────────────────────────────
  const makeMove = useCallback(
    (x, y) => {
      if (!socketRef.current || !state.matchId) return;
      try {
        sendMove(socketRef.current, state.matchId, x, y);
      } catch {
        showError("Something went wrong — move could not be sent.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [socketRef, state.matchId]
  );

  // ─── Play again ────────────────────────────────────────────────────────────
  const playAgain = useCallback(() => {
    dispatch({ type: "PLAY_AGAIN" });
  }, [dispatch]);

  return { state, dispatch, login, play, makeMove, playAgain };
}
