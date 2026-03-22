import { Client } from "@heroiclabs/nakama-js";

const client = new Client("defaultkey", "127.0.0.1", "7350", false);

export async function authenticate(deviceId) {
  const paddedId = deviceId.padEnd(10, "0");
  const session = await client.authenticateDevice(paddedId, true);
  console.log("Authenticated:", session.user_id);
  return session;
}
export async function connectSocket(session) {
  const socket = client.createSocket(false, false);

  await socket.connect(session, true);
  console.log("Socket connected");

  return socket;
}

const findMatchRpc = async (ctx, logger, nk, payload) => {
  const matches = await nk.matchList(10, true, "tic-tac-toe");

  if (matches.length > 0) {
    return JSON.stringify({ matchId: matches[0].matchId });
  }

  const matchId = await nk.matchCreate("match_handler", {});
  return JSON.stringify({ matchId });
};

export async function findMatch(session) {
  const res = await client.rpc(session, "find_match", {});
  const { matchId } = res.payload;

  console.log("Match ID:", matchId);
  return matchId;
}

export async function joinMatch(socket, matchId) {
  const match = await socket.joinMatch(matchId);

  console.log("Joined match:", match.match_id);

  return match;
}
export function setupMatchListener(socket) {
  socket.onmatchdata = (matchState) => {
    const data = JSON.parse(new TextDecoder().decode(matchState.data));

    console.log("Game Update:", data);
    console.log("OpCode:", matchState.op_code ?? matchState.opCode);
  };
}
export function sendMove(socket, matchId, x, y) {
  const move = { x, y };

  socket.sendMatchState(matchId, 1, JSON.stringify(move));
}