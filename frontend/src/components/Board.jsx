import Cell from "./Cell";
import styles from "./Board.module.css";

export default function Board({ board, myMark, onCellClick, disabled }) {
  return (
    <div className={styles.board}>
      {board.map((row, x) =>
        row.map((value, y) => (
          <Cell
            key={`${x}-${y}`}
            value={value}
            onClick={() => onCellClick(x, y)}
            disabled={disabled}
          />
        ))
      )}
    </div>
  );
}
