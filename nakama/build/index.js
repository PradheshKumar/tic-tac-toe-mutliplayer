/**
 * Tic-Tac-Toe — Nakama Server-Side Module
 *
 * Architecture: Server-Authoritative
 * All game state lives on the server. Clients send intents (moves); the
 * server validates them, mutates state, and broadcasts the new state to
 * every connected presence in the match.
 *
 * Match lifecycle:
 *   matchInit         → allocate blank state, set tick rate & label
 *   matchJoinAttempt  → gate-keep (reject full / finished matches)
 *   matchJoin         → add presence, start game when 2 players present
 *   matchLoop         → check turn timeout, process queued move messages
 *   matchLeave        → forfeit if a player disconnects mid-game
 *   matchTerminate    → cleanup on server shutdown
 *
 * OpCodes (server → client):
 *   0  initial game state broadcast on join
 *   1  game state update after a valid move (or win)
 *   2  game over — draw
 *   3  game over — opponent forfeited (disconnected)
 *   4  game over — opponent timed out (30 s turn limit exceeded)
 *
 * Player stats are persisted in Nakama Storage:
 *   collection: "player_stats", key: "stats", owner: <userId>
 *   { wins, losses, draws, streak }
 *
 * Leaderboard:
 *   ID: "tic_tac_toe_wins"
 *   Ranked by wins (descending), accumulated via the "incr" operator.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** How long (ms) a player has to make a move before they forfeit by timeout. */
var TURN_TIMEOUT_MS  = 30 * 1000;

/** Nakama leaderboard ID — created idempotently in InitModule. */
var LEADERBOARD_ID   = "tic_tac_toe_wins";

/** Nakama storage collection that holds per-player win/loss/draw/streak data. */
var STATS_COLLECTION = "player_stats";
var STATS_KEY        = "stats";

// ─────────────────────────────────────────────────────────────────────────────
// BOARD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a fresh 3×3 board filled with zeros (0 = empty, 1 = X, 2 = O). */
function createEmptyBoard() {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
}

/**
 * Scans all 8 winning lines and returns the mark value (1 or 2) of the winner,
 * or 0 if there is no winner yet.
 */
function checkWinner(board) {
  // All possible winning lines: rows, columns, diagonals
  var lines = [
    [[0,0],[0,1],[0,2]], // top row
    [[1,0],[1,1],[1,2]], // middle row
    [[2,0],[2,1],[2,2]], // bottom row
    [[0,0],[1,0],[2,0]], // left column
    [[0,1],[1,1],[2,1]], // middle column
    [[0,2],[1,2],[2,2]], // right column
    [[0,0],[1,1],[2,2]], // diagonal ↘
    [[0,2],[1,1],[2,0]], // diagonal ↙
  ];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var a = line[0], b = line[1], c = line[2];
    var val = board[a[0]][a[1]];
    // All three cells must be the same non-empty mark
    if (val !== 0 && val === board[b[0]][b[1]] && val === board[c[0]][c[1]]) {
      return val;
    }
  }
  return 0; // no winner yet
}

/** Returns true when every cell is occupied (board full → draw). */
function isBoardFull(board) {
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      if (board[i][j] === 0) return false;
    }
  }
  return true;
}

/**
 * Given the players array and a userId, returns the other player's ID.
 * Returns null if the userId is not found.
 */
function opponentOf(players, userId) {
  for (var i = 0; i < players.length; i++) {
    if (players[i] !== userId) return players[i];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER STATS (Nakama Storage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the current stats object for a player from Nakama Storage.
 * Returns a default object if the record doesn't exist yet.
 */
function readPlayerStats(nk, userId) {
  try {
    var reads   = [{ collection: STATS_COLLECTION, key: STATS_KEY, userId: userId }];
    var objects = nk.storageRead(reads);
    if (objects && objects.length > 0) {
      return objects[0].value;
    }
  } catch (_) { /* first-time player — record doesn't exist */ }

  // Default stats for a brand-new player
  return { wins: 0, losses: 0, draws: 0, streak: 0 };
}

/**
 * Write an updated stats object for a player to Nakama Storage.
 * permissionRead=2 → public (leaderboard page can read opponents' stats)
 * permissionWrite=1 → owner only (server runtime bypasses this)
 */
function writePlayerStats(nk, logger, userId, stats) {
  try {
    nk.storageWrite([{
      collection:      STATS_COLLECTION,
      key:             STATS_KEY,
      userId:          userId,
      value:           stats,
      permissionRead:  2, // public read
      permissionWrite: 1, // owner write (server bypasses)
    }]);
  } catch (e) {
    logger.error("Failed to write player stats for %s: %v", userId, e);
  }
}

/**
 * Update win/loss/draw/streak stats for a single player.
 * result: "win" | "loss" | "draw"
 */
function updatePlayerStats(nk, logger, userId, result) {
  if (!userId) return;
  var stats = readPlayerStats(nk, userId);

  if (result === "win") {
    stats.wins      = (stats.wins   || 0) + 1;
    stats.streak = (stats.streak || 0) + 1;
  } else if (result === "loss") {
    stats.losses = (stats.losses || 0) + 1;
    stats.streak = 0; 
  } else if (result === "draw") {
    stats.draws  = (stats.draws  || 0) + 1;
    stats.streak = 0; 
  }

  writePlayerStats(nk, logger, userId, stats);
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD + STATS RECORDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record the outcome of a completed match:
 *  - Increment the winner's leaderboard score by 1.
 *  - Update winner's stats: +1 win, streak++.
 *  - Update loser's stats:  +1 loss, streak=0.
 *
 * Pass null for loserId on forfeit where only the winner is known.
 */
function recordMatchResult(nk, logger, winnerId, loserId) {
  if (!winnerId) return;

  // ── Leaderboard (global ranking by wins) ──────────────────────────────────
  try {
    var users    = nk.usersGetId([winnerId]);
    var username = (users && users.length > 0) ? users[0].username : "";
    // "incr" operator adds `score` (1) to the existing leaderboard record
    nk.leaderboardRecordWrite(LEADERBOARD_ID, winnerId, username, 1, 0, {});
  } catch (e) {
    logger.error("Failed to record leaderboard win for %s: %v", winnerId, e);
  }

  // ── Per-player storage stats ───────────────────────────────────────────────
  updatePlayerStats(nk, logger, winnerId, "win");
  if (loserId) updatePlayerStats(nk, logger, loserId, "loss");
}

/**
 * Record a draw for both players.
 * Neither player gains a leaderboard point; both have their streak reset.
 */
function recordDrawResult(nk, logger, player1Id, player2Id) {
  updatePlayerStats(nk, logger, player1Id, "draw");
  updatePlayerStats(nk, logger, player2Id, "draw");
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH INIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called once when a match is created via nk.matchCreate().
 * Returns the initial match state, tick rate (1 Hz), and searchable label.
 */
function matchInit(ctx, logger, nk, params) {
  var state = {
    board:        createEmptyBoard(), // 3×3 grid, all zeros
    players:      [],                 // userId strings (max 2)
    marks:        {},                 // { userId: 1|2 }  1=X, 2=O
    currentTurn:  "",                 // userId whose turn it is
    status:       "WAITING",         // WAITING | ACTIVE | FINISHED
    winner:       null,              // userId of winner, or null for draw
    createdAt:    Date.now(),
    turnStartedAt: null,             // ms timestamp — set when game begins & each turn switch
  };

  return {
    state:    state,
    tickRate: 1,           // matchLoop fires once per second
    label:    "tic-tac-toe", // used by nk.matchList() for filtering
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH JOIN ATTEMPT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called before a player is allowed to join. Reject:
 *  - Finished matches (prevents joining a stale/ghost match)
 *  - Full matches (already 2 players)
 */
function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  if (state.status === "FINISHED") {
    return { state: state, accept: false, rejectMessage: "Match already finished" };
  }
  if (state.players.length >= 2) {
    return { state: state, accept: false, rejectMessage: "Match full" };
  }
  return { state: state, accept: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH JOIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called after a presence successfully joins. If 2 players are now present,
 * assign marks (1=X, 2=O), set status to ACTIVE, and start the turn timer.
 * Broadcasts opCode 0 (initial state) to all presences.
 */
function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
  // Add each joining presence to the players list
  for (var i = 0; i < presences.length; i++) {
    state.players.push(presences[i].userId);
  }

  if (state.players.length === 2) {
    // Assign marks: first to join is X (mark=1), second is O (mark=2)
    state.marks[state.players[0]] = 1;
    state.marks[state.players[1]] = 2;
    state.currentTurn   = state.players[0]; // X always goes first
    state.status        = "ACTIVE";
    state.turnStartedAt = Date.now();        // start 30-second turn clock
    logger.info("Match started between %s and %s", state.players[0], state.players[1]);
  }

  // Broadcast full state so newly joined clients can hydrate their UI
  dispatcher.broadcastMessage(0, JSON.stringify(state));

  return { state: state };
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH LOOP  (runs at tickRate = 1 Hz)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main game loop tick. Responsibilities:
 *  1. Terminate the match (return null) once it has finished — this removes
 *     the match from nk.matchList() so new players are never routed into it.
 *  2. Check the per-turn 30-second timeout and auto-forfeit if exceeded.
 *  3. Process any move messages queued since the last tick, validate each
 *     move, apply it to the board, and check for win/draw.
 */
function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
  // ── 1. Terminate finished matches immediately ──────────────────────────────
  // Returning null tells Nakama to shut down the match and remove it from
  // match listings. This prevents new players from being matched into it.
  if (state.status === "FINISHED") {
    return null;
  }

  // ── 2. Turn timeout check ──────────────────────────────────────────────────
  // If the current player hasn't moved within TURN_TIMEOUT_MS, they forfeit.
  if (state.status === "ACTIVE" && state.turnStartedAt !== null) {
    if (Date.now() - state.turnStartedAt > TURN_TIMEOUT_MS) {
      var timedOutPlayer = state.currentTurn;
      state.status = "FINISHED";
      state.winner = opponentOf(state.players, timedOutPlayer);

      // Record outcome: timeout loser gets a loss, opponent gets a win
      recordMatchResult(nk, logger, state.winner, timedOutPlayer);

      // opCode 4 = turn timeout — client shows "Time's up" message
      dispatcher.broadcastMessage(4, JSON.stringify(state));
      return { state: state };
    }
  }

  // ── 3. Process incoming move messages ─────────────────────────────────────
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];

    try {
      // Decode the binary WebSocket payload to a UTF-8 string, then parse JSON
      var data   = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(msg.data)));
      var x      = data.x;           // row  (0–2)
      var y      = data.y;           // col  (0–2)
      var userId = msg.sender.userId;

      // ── Server-side move validation (anti-cheat) ──────────────────────────
      if (state.status !== "ACTIVE") continue;          // game not active
      if (state.players.indexOf(userId) === -1) continue; // not a participant
      if (state.currentTurn !== userId) continue;       // not this player's turn
      if (x < 0 || x > 2 || y < 0 || y > 2) continue;  // out of bounds
      if (state.board[x][y] !== 0) continue;            // cell already taken

      // Apply the move
      var mark = state.marks[userId];
      state.board[x][y] = mark;

      // ── Check for win ─────────────────────────────────────────────────────
      var winnerMark = checkWinner(state.board);
      if (winnerMark !== 0) {
        state.status = "FINISHED";
        state.winner = userId;
        var loser    = opponentOf(state.players, userId);
        recordMatchResult(nk, logger, userId, loser);
        // opCode 1 = game state update (also used for win — clients check status)
        dispatcher.broadcastMessage(1, JSON.stringify(state));
        continue;
      }

      // ── Check for draw (board full, no winner) ────────────────────────────
      if (isBoardFull(state.board)) {
        state.status = "FINISHED";
        state.winner = null;
        recordDrawResult(nk, logger, state.players[0], state.players[1]);
        // opCode 2 = draw
        dispatcher.broadcastMessage(2, JSON.stringify(state));
        continue;
      }

      state.currentTurn   = opponentOf(state.players, userId);
      state.turnStartedAt = Date.now(); // reset the 30-second timer
      dispatcher.broadcastMessage(1, JSON.stringify(state));

    } catch (err) {
      logger.error("Failed to process move message: %v", err);
    }
  }

  return { state: state };
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH LEAVE  (forfeit on disconnect)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when a presence leaves the match (browser close, network drop, etc.).
 * If the game was in progress, the remaining player wins by forfeit.
 * opCode 3 = forfeit — client shows "Opponent disconnected" message.
 */
function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i++) {
    var userId = presences[i].userId;

    if (state.status === "ACTIVE") {
      state.status = "FINISHED";
      state.winner = opponentOf(state.players, userId);

      // Leaving player loses; their opponent wins
      recordMatchResult(nk, logger, state.winner, userId);

      // opCode 3 = forfeit
      dispatcher.broadcastMessage(3, JSON.stringify(state));
      logger.info("Player %s forfeited. Winner: %s", userId, state.winner);
    }
  }

  return { state: state };
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH TERMINATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by Nakama when the server is shutting down or the match is forcibly
 * terminated. Used for cleanup if needed.
 */
function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  logger.info("Match terminated (graceSeconds=%d)", graceSeconds);
  return { state: state };
}

/**
 * Called when a match signal is sent via the admin API.
 * Can be used for remote diagnostics / debugging.
 */
function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
  logger.info("Match signal received: %s", data);
  return { state: state, data: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC: find_match
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Client-callable RPC that implements automatic matchmaking:
 *  1. Search for an existing match that is still waiting for a second player
 *     (minSize=0, maxSize=1 ensures we only get matches with 0 or 1 presence).
 *  2. If one exists, return its ID → client joins the existing lobby.
 *  3. Otherwise, create a fresh match → client joins as player 1.
 *
 * Returns: { matchId: string }
 */
function findMatchRpc(ctx, logger, nk, payload) {
  // maxSize=1 filters to matches that still have room (< 2 presences joined)
  // label="tic-tac-toe" scopes the search to our game's matches only
  var matches = nk.matchList(10, true, "tic-tac-toe", 0, 1, "");

  if (matches.length > 0) {
    logger.info("Joining existing match: %s", matches[0].matchId);
    return JSON.stringify({ matchId: matches[0].matchId });
  }

  // No open match found — create a new one
  var matchId = nk.matchCreate("match_handler", {});
  logger.info("Created new match: %s", matchId);
  return JSON.stringify({ matchId: matchId });
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC: get_player_stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Client-callable RPC to fetch per-player stats for a list of user IDs.
 * Used by the leaderboard page to enrich each entry with W/L/D/streak data.
 *
 * Payload:  { userIds: string[] }
 * Returns:  { stats: { [userId]: { wins, losses, draws, streak } } }
 */
function getPlayerStatsRpc(ctx, logger, nk, payload) {
  try {
    var data    = JSON.parse(payload || "{}");
    var userIds = data.userIds || [];

    if (userIds.length === 0) {
      return JSON.stringify({ stats: {} });
    }

    // Build a batch read request for all requested user IDs
    var reads = [];
    for (var i = 0; i < userIds.length; i++) {
      reads.push({ collection: STATS_COLLECTION, key: STATS_KEY, userId: userIds[i] });
    }

    var objects = nk.storageRead(reads);
    var stats   = {};

    if (objects) {
      for (var j = 0; j < objects.length; j++) {
        // Key the result by the storage object's userId field
        stats[objects[j].userId] = objects[j].value;
      }
    }

    return JSON.stringify({ stats: stats });
  } catch (e) {
    logger.error("get_player_stats RPC failed: %v", e);
    return JSON.stringify({ stats: {} });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE INIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Entry point — called once when the Nakama server starts or the module is
 * hot-reloaded. Registers the match handler and all RPC endpoints.
 */
function InitModule(ctx, logger, nk, initializer) {
  // ── Create the leaderboard (idempotent — safe to call on every boot) ───────
  try {
    // "desc" sort, "incr" operator (each win adds 1 to existing score)
    nk.leaderboardCreate(LEADERBOARD_ID, false, "desc", "incr", "", {});
    logger.info("Leaderboard '%s' ready", LEADERBOARD_ID);
  } catch (e) {
    // Error is expected if the leaderboard already exists from a previous run
    logger.info("Leaderboard already exists (this is fine): %v", e);
  }

  // ── Register the authoritative match handler ────────────────────────────────
  initializer.registerMatch("match_handler", {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLoop,
    matchLeave,
    matchTerminate,
    matchSignal,
  });

  // ── Register RPCs callable by authenticated clients ─────────────────────────
  initializer.registerRpc("find_match",        findMatchRpc);
  initializer.registerRpc("get_player_stats",  getPlayerStatsRpc);

  logger.info("Tic-Tac-Toe module initialized successfully");
}

// Export for Nakama's Goja JS runtime
globalThis.InitModule = InitModule;
