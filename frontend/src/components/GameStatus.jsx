import styles from "./GameStatus.module.css";

const OPCODE_FORFEIT  = 3;
const OPCODE_TIMEOUT  = 4;

export default function GameStatus({
  status,
  winner,
  myUserId,
  isMyTurn,
  lastOpCode,
}) {
  function getMessage() {
    if (status === "FINISHED") {
      if (lastOpCode === OPCODE_TIMEOUT) {
        if (winner === myUserId)  return { text: "Opponent ran out of time — You win! ⏰", type: "win"  };
        return { text: "Time's up — You lose ⏰", type: "lose" };
      }
      if (lastOpCode === OPCODE_FORFEIT) {
        if (winner === myUserId)  return { text: "Opponent disconnected — You win! 🎉", type: "win"  };
        return { text: "You disconnected — Opponent wins", type: "lose" };
      }
      if (!winner)                return { text: "It's a Draw! 🤝", type: "draw" };
      if (winner === myUserId)    return { text: "You Win! 🎉",     type: "win"  };
      return { text: "You Lose 😔", type: "lose" };
    }

    if (isMyTurn) return { text: "Your turn",        type: "your-turn" };
    return           { text: "Opponent's turn…",    type: "waiting"   };
  }

  const { text, type } = getMessage();

  return (
    <div className={`${styles.status} ${styles[type]}`}>
      <span className={styles.text}>{text}</span>
    </div>
  );
}
