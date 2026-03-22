import styles from "./PlayerCard.module.css";

const MARK_SYMBOL = { 1: "X", 2: "O" };
const MARK_LABEL = { 1: "X — goes first", 2: "O — goes second" };

export default function PlayerCard({ userId, mark, isCurrentTurn, label, isMe }) {
  const initials = userId ? userId.slice(0, 2).toUpperCase() : "??";
  const symbol = MARK_SYMBOL[mark] ?? "?";

  return (
    <div
      className={[
        styles.card,
        isCurrentTurn ? styles.active : "",
        isMe ? styles.me : "",
      ]
        .join(" ")
        .trim()}
    >
      <div className={`${styles.avatar} ${mark === 1 ? styles.x : styles.o}`}>
        {initials}
      </div>

      <p className={styles.label}>{label}</p>

      <div className={`${styles.mark} ${mark === 1 ? styles.markX : styles.markO}`}>
        {symbol}
      </div>

      <p className={styles.markLabel}>{MARK_LABEL[mark] ?? "—"}</p>

      {isCurrentTurn && (
        <div className={styles.turnIndicator}>● Turn</div>
      )}
    </div>
  );
}
