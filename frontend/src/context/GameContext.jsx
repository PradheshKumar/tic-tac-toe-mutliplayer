import { createContext, useContext, useReducer, useRef } from "react";

export const GameContext = createContext(null);

// ─── OpCodes from the server ─────────────────────────────────────────────────
// 0  → initial state broadcast on join
// 1  → move made / win (game state update)
// 2  → draw
// 3  → opponent disconnected / forfeit

// ─── App phases ──────────────────────────────────────────────────────────────
// login        → user hasn't authenticated yet
// lobby        → authenticated, ready to play
// waiting      → joined a match, waiting for second player
// playing      → both players connected, game in progress
// finished     → game over (win / draw / forfeit / timeout)
// leaderboard  → viewing the leaderboard

const initialState = {
  phase: "login",
  session: null,           // Nakama session object
  socket: null,            // Nakama socket object
  matchId: null,
  gameState: null,         // last broadcast from server
  myUserId: null,
  myMark: null,            // 1 = X, 2 = O
  error: null,
  lastOpCode: null,
  leaderboardRecords: [],  // cached leaderboard entries
};

function derivePhase(status) {
  if (status === "ACTIVE") return "playing";
  if (status === "FINISHED") return "finished";
  return "waiting";
}

function gameReducer(state, action) {
  switch (action.type) {
    case "AUTH_SUCCESS": {
      return {
        ...state,
        session: action.session,
        socket: action.socket,
        myUserId: action.session.user_id,
        phase: "lobby",
        error: null,
      };
    }

    case "MATCH_JOINED": {
      // GAME_UPDATE (opCode 0 broadcast from matchJoin) can arrive before this action
      // because the WebSocket message fires before joinMatch's promise resolves on the
      // client. Don't overwrite "playing" or "finished" if we already transitioned.
      const alreadyTransitioned =
        state.phase === "playing" || state.phase === "finished";
      return {
        ...state,
        matchId: action.matchId,
        phase: alreadyTransitioned ? state.phase : "waiting",
        error: null,
      };
    }

    case "GAME_UPDATE": {
      const { gameState, opCode } = action;
      const myMark = gameState.marks?.[state.myUserId] ?? state.myMark;
      const phase = derivePhase(gameState.status);
      return {
        ...state,
        gameState,
        myMark,
        phase,
        lastOpCode: opCode,
        error: null,
      };
    }

    case "SET_ERROR": {
      return { ...state, error: action.message };
    }

    case "CLEAR_ERROR": {
      return { ...state, error: null };
    }

    case "PLAY_AGAIN": {
      // Keep session & socket, go back to lobby
      return {
        ...initialState,
        phase: "lobby",
        session: state.session,
        socket: state.socket,
        myUserId: state.myUserId,
        leaderboardRecords: state.leaderboardRecords,
      };
    }

    case "SHOW_LEADERBOARD": {
      return { ...state, phase: "leaderboard" };
    }

    case "SET_LEADERBOARD": {
      return { ...state, leaderboardRecords: action.records };
    }

    case "BACK_TO_LOBBY": {
      return { ...state, phase: "lobby" };
    }

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  // socketRef gives services synchronous access without stale closure issues
  const socketRef = useRef(null);

  return (
    <GameContext.Provider value={{ state, dispatch, socketRef }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGameContext must be used inside <GameProvider>");
  return ctx;
}
