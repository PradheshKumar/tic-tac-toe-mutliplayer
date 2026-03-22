import styles from "./WaitingScreen.module.css";

export default function WaitingScreen({ matchId }) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.dots}>
          <span /><span /><span />
        </div>
        <h2 className={styles.title}>Waiting for opponent…</h2>
        <p className={styles.subtitle}>
          Share the match ID or wait for someone to join.
        </p>
        {matchId && (
          <div className={styles.matchId}>
            <span className={styles.matchLabel}>Match ID</span>
            <code className={styles.matchCode}>{matchId}</code>
          </div>
        )}
      </div>
    </div>
  );
}
