import { useState } from "react";
import { useGame } from "../hooks/useGame";
import styles from "./LobbyPage.module.css";

export default function LobbyPage() {
  const { play, dispatch, state } = useGame();
  const [loading, setLoading] = useState(false);

  async function handlePlay() {
    setLoading(true);
    await play();
    setLoading(false);
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.avatar}>
          {state.myUserId?.slice(0, 2).toUpperCase() ?? "??"}
        </div>

        <h2 className={styles.welcome}>Ready to play?</h2>
        <p className={styles.id}>
          ID: <code className={styles.code}>{state.myUserId ?? "—"}</code>
        </p>

        <p className={styles.description}>
          Press <strong>Play</strong> to find an available match or create a new one.
          The server pairs you automatically with another player.
        </p>

        {state.error && <p className={styles.error}>{state.error}</p>}

        <button className={styles.btn} onClick={handlePlay} disabled={loading}>
          {loading ? <span className={styles.spinner} /> : "▶ Play"}
        </button>

        <button
          className={styles.lbBtn}
          onClick={() => dispatch({ type: "SHOW_LEADERBOARD" })}
        >
          🏆 Leaderboard
        </button>

        <div className={styles.rules}>
          <h3>Rules</h3>
          <ul>
            <li>First to get 3 in a row wins</li>
            <li>You have <strong>30 seconds</strong> per turn</li>
            <li>Only valid moves are accepted by the server</li>
            <li>Disconnecting forfeits the match</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
