/**
 * LeaderboardPage.jsx
 *
 * Displays the global Tic-Tac-Toe leaderboard ranked by wins.
 * Each row shows: Rank, Player name, Wins, Losses, Draws, and best Win Streak.
 * The current player's row is highlighted.
 */

import { useEffect, useState } from "react";
import { useGame } from "../hooks/useGame";
import { fetchLeaderboard } from "../services/leaderboardService";
import styles from "./LeaderboardPage.module.css";

/** Medal emoji for the top 3 positions. */
const MEDAL = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const { state, dispatch } = useGame();
  const [records, setRecords] = useState(state.leaderboardRecords);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Fetch leaderboard data on mount (enriched with W/L/D stats from storage)
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchLeaderboard(state.session);
        setRecords(rows);
        // Cache records in global state so they survive a re-navigation
        dispatch({ type: "SET_LEADERBOARD", records: rows });
      } catch (e) {
        setError("Could not load leaderboard. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Back button */}
        <button
          className={styles.back}
          onClick={() => dispatch({ type: "BACK_TO_LOBBY" })}
        >
          ← Back
        </button>

        <h1 className={styles.title}>🏆 Leaderboard</h1>
        <p className={styles.subtitle}>Global rankings — Tic-Tac-Toe</p>

        {/* Loading state */}
        {loading && (
          <div className={styles.loadingRow}>
            <span className={styles.spinner} />
            <span>Loading…</span>
          </div>
        )}

        {/* Error state */}
        {error && <p className={styles.error}>{error}</p>}

        {/* Empty state */}
        {!loading && !error && records.length === 0 && (
          <p className={styles.empty}>No games played yet. Be the first to win!</p>
        )}

        {/* Leaderboard table */}
        {!loading && records.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Rank</th>
                <th className={styles.th}>Player</th>
                {/* W / L / D columns sourced from Nakama Storage stats */}
                <th className={`${styles.th} ${styles.center}`}>W</th>
                <th className={`${styles.th} ${styles.center}`}>L</th>
                <th className={`${styles.th} ${styles.center}`}>D</th>
                {/* Current win streak — resets to 0 after any loss or draw */}
                <th className={`${styles.th} ${styles.center}`}>🔥 Streak</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec, idx) => {
                const isMe  = rec.owner_id === state.myUserId;
                const stats = rec.stats ?? {};

                return (
                  <tr
                    key={rec.owner_id}
                    className={[styles.row, isMe ? styles.myRow : ""].join(" ").trim()}
                  >
                    {/* Rank: medal emoji for top 3, then #N */}
                    <td className={styles.td}>
                      {MEDAL[idx] ?? `#${rec.rank ?? idx + 1}`}
                    </td>

                    {/* Player name + "You" badge */}
                    <td className={styles.td}>
                      <span className={styles.username}>
                        {rec.username || "Unknown"}
                        {isMe && <span className={styles.youBadge}>You</span>}
                      </span>
                    </td>

                    {/* Wins — highlighted in accent color */}
                    <td className={`${styles.td} ${styles.center}`}>
                      <span className={styles.wins}>{stats.wins ?? rec.score ?? 0}</span>
                    </td>

                    {/* Losses */}
                    <td className={`${styles.td} ${styles.center}`}>
                      <span className={styles.losses}>{stats.losses ?? 0}</span>
                    </td>

                    {/* Draws */}
                    <td className={`${styles.td} ${styles.center}`}>
                      <span className={styles.draws}>{stats.draws ?? 0}</span>
                    </td>

                    {/* Current win streak — resets after a loss or draw */}
                    <td className={`${styles.td} ${styles.center}`}>
                      <span className={styles.streak}>{stats.streak ?? 0}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
