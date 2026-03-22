import styles from "./Cell.module.css";

const MARKS = { 1: "X", 2: "O" };

export default function Cell({ value, onClick, disabled }) {
  const mark = MARKS[value] ?? null;

  return (
    <button
      className={[
        styles.cell,
        mark === "X" ? styles.x : "",
        mark === "O" ? styles.o : "",
        !mark && !disabled ? styles.empty : "",
      ]
        .join(" ")
        .trim()}
      onClick={onClick}
      disabled={disabled || !!mark}
      aria-label={mark ? `Cell: ${mark}` : "Empty cell"}
    >
      {mark && <span className={styles.mark}>{mark}</span>}
    </button>
  );
}
