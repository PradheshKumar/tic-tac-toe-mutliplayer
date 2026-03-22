import { useState, useEffect, useRef } from "react";
import styles from "./TurnTimer.module.css";

const TURN_TIMEOUT_S = 30;

export default function TurnTimer({ turnStartedAt, isMyTurn, status }) {
  const [remaining, setRemaining] = useState(TURN_TIMEOUT_S);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (status !== "ACTIVE" || !turnStartedAt) {
      setRemaining(TURN_TIMEOUT_S);
      return;
    }

    function tick() {
      const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
      const left = Math.max(0, TURN_TIMEOUT_S - elapsed);
      setRemaining(left);
    }

    tick(); // run immediately
    intervalRef.current = setInterval(tick, 500);

    return () => clearInterval(intervalRef.current);
  }, [turnStartedAt, status]);

  if (status !== "ACTIVE") return null;

  const pct = (remaining / TURN_TIMEOUT_S) * 100;
  const urgent = remaining <= 10;

  return (
    <div className={styles.wrapper}>
      <div
        className={[styles.bar, urgent ? styles.urgent : ""].join(" ").trim()}
        style={{ width: `${pct}%` }}
      />
      <span className={[styles.label, urgent ? styles.urgentLabel : ""].join(" ").trim()}>
        {isMyTurn ? `Your turn: ${remaining}s` : `Opponent: ${remaining}s`}
      </span>
    </div>
  );
}
