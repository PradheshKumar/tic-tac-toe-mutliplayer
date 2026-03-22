/**
 * leaderboardService.js
 *
 * Handles fetching leaderboard records and per-player stats from Nakama.
 * The leaderboard stores wins (global ranking); detailed W/L/D/streak data
 * lives in Nakama Storage and is fetched via the get_player_stats RPC.
 */

import client from "./nakamaClient";

/** Must match the LEADERBOARD_ID constant in nakama/build/index.js */
const LEADERBOARD_ID = "tic_tac_toe_wins";

/**
 * Fetch the global leaderboard and enrich each record with W/L/D/streak stats.
 *
 * Steps:
 *  1. List top `limit` leaderboard records (ranked by wins, descending).
 *  2. Extract user IDs from those records.
 *  3. Call the get_player_stats RPC to fetch per-player storage stats.
 *  4. Merge stats into each leaderboard record so the UI has everything it needs.
 *
 * @param {object} session  - Nakama session from authenticate
 * @param {number} [limit]  - Maximum number of records to fetch (default 20)
 * @returns {Promise<Array>} Records enriched with a `stats` field
 */
export async function fetchLeaderboard(session, limit = 20) {
  // Step 1: fetch global leaderboard records (ranked by score = wins)
  const result  = await client.listLeaderboardRecords(
    session,
    LEADERBOARD_ID,
    [],     // ownerIds — empty array = fetch global list, not specific users
    limit
  );
  const records = result.records ?? [];

  if (records.length === 0) return records;

  // Step 2: collect user IDs so we can batch-fetch their storage stats
  const userIds = records.map((r) => r.owner_id);

  // Step 3: call the server RPC for detailed W/L/D/streak data
  let statsMap = {};
  try {
    const rpcResult = await client.rpc(session, "get_player_stats", { userIds });
    statsMap = rpcResult.payload?.stats ?? {};
  } catch (_) {
    // Stats are supplemental — a failure here shouldn't break the leaderboard
  }

  // Step 4: merge storage stats into each leaderboard record
  return records.map((rec) => ({
    ...rec,
    // Default to zeros for players who have never had stats written (edge case)
    stats: statsMap[rec.owner_id] ?? { wins: 0, losses: 0, draws: 0, streak: 0 },
  }));
}
