import {
  authenticate,
  connectSocket,
  findMatch,
  joinMatch,
  setupMatchListener,
  sendMove
} from "./flow.js";

async function run() {
  try {
    const session1 = await authenticate("player1");
    const socket1 = await connectSocket(session1);

    const session2 = await authenticate("player2");
    const socket2 = await connectSocket(session2);

    const matchId = await findMatch(session1);

    await joinMatch(socket1, matchId);
    await joinMatch(socket2, matchId);

    setupMatchListener(socket1);
    setupMatchListener(socket2);

    setTimeout(() => sendMove(socket1, matchId, 0, 0), 1000);
    setTimeout(() => sendMove(socket2, matchId, 1, 1), 2000);

  } catch (err) {
    console.error("🔥 ERROR:", err);
  }
}

run();