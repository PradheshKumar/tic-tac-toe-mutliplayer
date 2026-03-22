import { useGame } from "../hooks/useGame";
import Board from "../components/Board";
import GameStatus from "../components/GameStatus";
import PlayerCard from "../components/PlayerCard";
import TurnTimer from "../components/TurnTimer";
import WaitingScreen from "../components/WaitingScreen";
import styles from "./GamePage.module.css";

export default function GamePage() {
  const { state, makeMove, playAgain } = useGame();
  const { phase, gameState, myUserId, myMark, error, matchId } = state;

  if (phase === "waiting") {
    return <WaitingScreen matchId={matchId} />;
  }

  if (!gameState) return null;

  const { board, players, marks, currentTurn, status, winner, turnStartedAt } = gameState;

  const isMyTurn    = currentTurn === myUserId && status === "ACTIVE";
  const opponentId  = players?.find((id) => id !== myUserId) ?? null;
  const opponentMark = opponentId ? marks?.[opponentId] : null;

  function handleCellClick(x, y) {
    if (!isMyTurn) return;
    if (board[x][y] !== 0) return;
    makeMove(x, y);
  }

  return (
    <div className={styles.container}>
      <div className={styles.layout}>
        {/* Left — opponent */}
        <PlayerCard
          userId={opponentId}
          mark={opponentMark}
          isCurrentTurn={currentTurn === opponentId && status === "ACTIVE"}
          label="Opponent"
        />

        {/* Center */}
        <div className={styles.center}>
          <GameStatus
            status={status}
            winner={winner}
            myUserId={myUserId}
            isMyTurn={isMyTurn}
            lastOpCode={state.lastOpCode}
          />

          <TurnTimer
            turnStartedAt={turnStartedAt}
            isMyTurn={isMyTurn}
            status={status}
          />

          {error && <p className={styles.error}>{error}</p>}

          <Board
            board={board}
            myMark={myMark}
            onCellClick={handleCellClick}
            disabled={!isMyTurn || status !== "ACTIVE"}
          />

          {status === "FINISHED" && (
            <button className={styles.playAgainBtn} onClick={playAgain}>
              ↩ Back to Lobby
            </button>
          )}
        </div>

        {/* Right — me */}
        <PlayerCard
          userId={myUserId}
          mark={myMark}
          isCurrentTurn={isMyTurn}
          label="You"
          isMe
        />
      </div>
    </div>
  );
}
