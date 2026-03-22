# Multiplayer Tic-Tac-Toe — Nakama Backend

A production-ready, real-time multiplayer Tic-Tac-Toe game built with a **server-authoritative architecture** using [Nakama](https://heroiclabs.com/nakama/) as the game backend and **React + Vite** for the frontend.

---

## Table of Contents

1. [Architecture & Design Decisions](#architecture--design-decisions)
2. [Project Structure](#project-structure)
3. [Setup & Installation](#setup--installation)
4. [Running Locally](#running-locally)
5. [Deployment](#deployment)
6. [API / Server Configuration](#api--server-configuration)
7. [How to Test Multiplayer](#how-to-test-multiplayer)
8. [Features](#features)
9. [AI Declaration](#ai-declaration)

---

## Architecture & Design Decisions

### Server-Authoritative Game Logic

All game state lives on the Nakama server. Clients send **intents** (e.g. "I want to play at row 1, col 2"); the server validates the move, mutates state, and broadcasts the authoritative new state to all connected presences. This design:

- Prevents cheating — a client cannot place a mark out of turn or overwrite another player's cell.
- Provides a single source of truth — both clients always see the same board state.
- Handles edge cases centrally — forfeit, timeout, draw, and disconnection logic lives in one place.

### Matchmaking Flow

```
Client                          Nakama Server
  |                                   |
  |--- RPC: find_match -------------->|
  |                                   |  matchList(maxSize=1) → find open match
  |<-- { matchId } ------------------|  or matchCreate() if none found
  |                                   |
  |--- socket.joinMatch(matchId) ---->|  matchJoinAttempt → validate
  |                                   |  matchJoin → add presence
  |<-- opCode 0 (initial state) ------|  broadcastMessage when 2nd player joins
  |                                   |
```

`find_match` RPC uses `matchList(maxSize=1)` to only surface matches still waiting for a second player, preventing a player from being routed into a full or finished match.

### WebSocket OpCodes

| OpCode | Direction       | Meaning                                      |
|--------|-----------------|----------------------------------------------|
| 0      | Server → Client | Initial game state on join                   |
| 1      | Server → Client | Game state update after a valid move (or win) |
| 2      | Server → Client | Game over — Draw                             |
| 3      | Server → Client | Game over — Opponent forfeited (disconnected) |
| 4      | Server → Client | Game over — Opponent timed out (30 s)        |
| 1      | Client → Server | Player move intent `{ x, y }`               |

### Frontend State Machine

The app uses a single `useReducer`-based state machine with these phases:

```
login → lobby → waiting → playing → finished → leaderboard
                  ↑                      |
                  └──── play again ───────┘
```

**Race condition fix:** When Player 2 joins, the server broadcasts opCode 0 (via `matchJoin`) before the client's `joinMatch` promise resolves. The `GAME_UPDATE` dispatch (from the WebSocket handler) can therefore transition the phase to `"playing"` before `MATCH_JOINED` fires. The reducer explicitly preserves `"playing"` or `"finished"` phases inside the `MATCH_JOINED` case to avoid overwriting them.

### Leaderboard & Player Stats

- **Global leaderboard** (`tic_tac_toe_wins`): Tracks wins using Nakama's built-in leaderboard API with the `incr` operator. Ranked descending by score.
- **Detailed stats**: Wins, losses, draws, current streak, and best-ever streak are stored per-player in **Nakama Storage** (collection: `player_stats`, key: `stats`). This allows the leaderboard page to show a full W/L/D/Streak table.

### Turn Timer

Each player has **30 seconds** per move. The timer is tracked server-side (`turnStartedAt` timestamp in match state). On each `matchLoop` tick (1 Hz), the server checks if the current player has exceeded the timeout and automatically awards the win to their opponent (opCode 4). The client displays a live countdown using the `turnStartedAt` value from the game state.

### Concurrent Game Support

Nakama's authoritative match system natively supports thousands of concurrent isolated matches. Each match runs as an independent goroutine with its own state — there is no shared mutable state between matches.

---

## Project Structure

```
tic-tac-toe/
├── docker-compose.yml          # Nakama + PostgreSQL local stack
├── nakama/
│   └── build/
│       └── index.js            # Server-side game module (Nakama JS runtime)
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── App.jsx             # Root router (phase-based)
│       ├── main.jsx
│       ├── context/
│       │   └── GameContext.jsx # Global state (useReducer) + React Context
│       ├── hooks/
│       │   └── useGame.js      # Business logic: login, play, makeMove
│       ├── services/
│       │   ├── nakamaClient.js      # Shared Nakama JS SDK client instance
│       │   ├── gameService.js       # authenticate, connectSocket, findMatch, joinMatch, sendMove
│       │   └── leaderboardService.js# fetchLeaderboard (records + storage stats)
│       ├── pages/
│       │   ├── LoginPage.jsx        # Username entry → Nakama device auth
│       │   ├── LobbyPage.jsx        # Play button + leaderboard link
│       │   ├── GamePage.jsx         # Board, player cards, timer, status
│       │   └── LeaderboardPage.jsx  # W/L/D/Streak global rankings
│       └── components/
│           ├── Board.jsx            # 3x3 grid
│           ├── Cell.jsx             # Individual cell (X / O / empty)
│           ├── PlayerCard.jsx       # Player info + active turn indicator
│           ├── GameStatus.jsx       # Win / loss / draw / turn messages
│           ├── TurnTimer.jsx        # 30-second countdown bar
│           └── WaitingScreen.jsx    # "Waiting for opponent" screen
└── docs/
    └── SYSTEM_DESIGN.md
```

---

## Setup & Installation

### Prerequisites

| Tool | Version |
|------|---------|
| Docker + Docker Compose | Latest |
| Node.js | 18+ |
| npm | 9+ |

### 1. Clone the repository

```bash
git clone <repo-url>
cd tic-tac-toe
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Running Locally

### Start the Nakama server

From the project root:

```bash
docker-compose up
```

This starts:
- **PostgreSQL** on port `5432` (internal)
- **Nakama** on ports `7350` (HTTP/RPC) and `7351` (gRPC/console)

Wait for the log line: `Tic-Tac-Toe module initialized successfully`

> **After any change to `nakama/build/index.js`**, restart the server:
> ```bash
> docker-compose restart nakama
> ```

### Start the frontend dev server

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Nakama Console (admin UI)

[http://localhost:7351](http://localhost:7351) — Username: `admin`, Password: `password`

Use the console to inspect matches, leaderboards, and storage objects.

---

## Deployment

### Backend — Railway (free tier)

[Railway](https://railway.app) supports Docker Compose natively and has a free starter plan ($5 credit/month, no credit card required).

1. **Push your code to GitHub** (if not already).

2. **Create a Railway account** at railway.app and click **New Project → Deploy from GitHub repo**.

3. **Select this repository.** Railway detects `docker-compose.yml` automatically.

4. **Set environment variables** in the Railway dashboard under your service settings:
   ```
   POSTGRES_PASSWORD=<strong-random-password>
   ```

5. **Expose the Nakama port.** In the Railway service settings, set the public port to `7350`. Railway gives you a public URL like `nakama-production-xxxx.up.railway.app`.

6. **Verify** by opening `https://<your-railway-url>/healthcheck` — should return `{}`

> **Alternative free option: [Fly.io](https://fly.io)**
> Fly.io has a permanent free tier (3 shared VMs + managed Postgres).
> ```bash
> # Install flyctl, then from the project root:
> fly launch          # detects docker-compose, creates fly.toml
> fly deploy
> ```

### Frontend — Vercel (free tier)

[Vercel](https://vercel.com) is free for personal projects with no limits on bandwidth.

1. **Create a Vercel account** at vercel.com → **New Project → Import Git Repository**.

2. **Configure the project:**
   - Framework preset: `Vite`
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Output directory: `dist`

3. **Set environment variables** in the Vercel dashboard under **Project → Settings → Environment Variables**:
   ```
   VITE_NAKAMA_KEY   = defaultkey
   VITE_NAKAMA_HOST  = <your-railway-or-flyio-url>
   VITE_NAKAMA_PORT  = 443
   VITE_NAKAMA_SSL   = true
   ```
   > These are baked into the JS bundle at Vite build time. Any change to these values requires a redeploy.

4. **Deploy.** Vercel gives you a public URL like `tic-tac-toe-xxx.vercel.app`.

> **Alternative free option: [Netlify](https://netlify.com)**
> Set the same four `VITE_*` variables under **Site → Environment variables**, then:
> ```bash
> cd frontend && npm run build
> # Drag-and-drop the dist/ folder at app.netlify.com/drop
> ```

### Production environment checklist

| Config | Development | Production |
|--------|-------------|------------|
| Nakama server key | `defaultkey` | Change to a strong secret |
| Nakama host | `127.0.0.1` | Railway/Fly.io public URL |
| Nakama port / SSL | `7350` / `false` | `443` / `true` |
| PostgreSQL password | `localdb` | Strong random password |
| Log level | `DEBUG` | `INFO` or `WARN` |
| Frontend URL | `localhost:3000` | Vercel/Netlify public URL |

---

## API / Server Configuration

### Nakama RPC Endpoints

All RPCs are called by authenticated clients via the Nakama JS SDK (`client.rpc(session, rpcId, payload)`).

#### `find_match`

Automatic matchmaking — finds or creates a match.

- **Payload**: `{}` (empty)
- **Response**: `{ "matchId": "<uuid>.nakama1" }`
- **Logic**: Lists open matches with `maxSize=1` (waiting for a 2nd player). Returns the first result or creates a fresh match.

#### `get_player_stats`

Batch-fetch per-player W/L/D/streak stats from Nakama Storage.

- **Payload**: `{ "userIds": ["<uuid>", ...] }`
- **Response**:
  ```json
  {
    "stats": {
      "<userId>": {
        "wins": 5,
        "losses": 2,
        "draws": 1,
        "streak": 3,
      }
    }
  }
  ```

### Nakama Storage Schema

| Collection | Key | Owner | Read | Write |
|------------|-----|-------|------|-------|
| `player_stats` | `stats` | userId | Public (2) | Owner/Server (1) |

### Match State Shape (broadcast to clients on every update)

```json
{
  "board": [[0,0,0],[0,0,0],[0,0,0]],
  "players": ["<userId1>", "<userId2>"],
  "marks": { "<userId1>": 1, "<userId2>": 2 },
  "currentTurn": "<userId>",
  "status": "WAITING | ACTIVE | FINISHED",
  "winner": "<userId> | null",
  "createdAt": 1234567890000,
  "turnStartedAt": 1234567890000
}
```

Cell values: `0` = empty, `1` = X, `2` = O.

### Nakama Configuration (`docker-compose.yml`)

Key flags passed to the Nakama binary:

```
--runtime.path /nakama/data/modules/build   JS module directory (mounted volume)
--logger.level DEBUG                         change to INFO in production
--name nakama1                               node name (used in match IDs)
```

---

## How to Test Multiplayer

### Two-player test in a single browser (two tabs)

1. Open `http://localhost:3000` in **Tab A**.
2. Enter username `player1` → click **Enter Game**.
3. Click **▶ Play** — Tab A shows "Waiting for opponent…".
4. Open `http://localhost:3000` in a **new Tab B** (same browser is fine).
5. Enter username `player2` → click **Enter Game** → click **▶ Play**.
6. Both tabs should transition to the game board **simultaneously**.
7. Make moves in Tab A (X always goes first). Tab B updates in real time.
8. Alternate moves until someone wins or the board is full (draw).

### Testing the turn timer (30 s)

1. Start a two-player game (both tabs at game board).
2. Do **not** make a move.
3. After 30 seconds the server auto-forfeits the idle player.
4. The idle player's tab shows "Time's up — You lose ⏰"; the other tab shows "Opponent ran out of time — You win! ⏰".

### Testing forfeit on disconnect

1. Start a two-player game.
2. Close one of the tabs (or navigate away).
3. The remaining tab shows "Opponent disconnected — You win! 🎉" within 1–2 seconds (one `matchLoop` tick).

### Testing the leaderboard

1. Complete several games (wins, losses, draws).
2. From the lobby click **🏆 Leaderboard**.
3. Your W / L / D / Streak columns should reflect the games played.
4. Win several games in a row and verify the **Streak** column increments.

### Nakama Console verification

1. Open `http://localhost:7351` → login with `admin` / `password`.
2. **Leaderboard** tab → `tic_tac_toe_wins` — global win rankings.
3. **Storage** tab → filter collection `player_stats` — per-player W/L/D objects.
4. **Matches** tab — active and recently completed match list.

---

## Features

### Core (Required)

- [x] Server-authoritative game logic — all moves validated on the server
- [x] Anti-cheat — out-of-turn moves, out-of-bounds, and occupied cells rejected
- [x] Automatic matchmaking — `find_match` RPC pairs players or creates a new room
- [x] Real-time game state via WebSocket
- [x] Graceful disconnect handling — forfeit awarded to remaining player
- [x] Responsive React frontend optimized for mobile

### Optional (Bonus)

- [x] **Concurrent game support** — each match is an isolated Nakama authoritative match
- [x] **Leaderboard** — global rankings by wins; per-player W/L/D/Streak via Nakama Storage
- [x] **Turn timer** — 30 s per move, server-enforced auto-forfeit, live countdown in UI

---

## AI Declaration

I used **Claude Code** (Anthropic) as an AI assistant during parts of this project. In the interest of full transparency, here is exactly what it helped with and what it did not:

**AI-assisted:**
- React frontend scaffolding and component structure
- Getting familiar with Nakama JS runtime syntax
- README and inline code documentation

**Written independently:**
- All server-side game logic (`nakama/build/index.js`) — match lifecycle, move validation, win/draw/forfeit detection, turn timer, leaderboard and storage integration
- Architecture decisions (server-authoritative design, matchmaking strategy, state machine phases)
- All Nakama integration on the frontend — RPC calls (`find_match`, `get_player_stats`), WebSocket connection management, real-time match data handling, and the full state machine in `GameContext.jsx` and `useGame.js`
- Debugging and fixing the two core bugs: stale match "Match Full" issue and the Player 2 race condition on join