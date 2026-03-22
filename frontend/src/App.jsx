import { GameProvider, useGameContext } from "./context/GameContext";
import LoginPage from "./pages/LoginPage";
import LobbyPage from "./pages/LobbyPage";
import GamePage from "./pages/GamePage";
import LeaderboardPage from "./pages/LeaderboardPage";

function Router() {
  const { state } = useGameContext();

  switch (state.phase) {
    case "login":
      return <LoginPage />;
    case "lobby":
      return <LobbyPage />;
    case "waiting":
    case "playing":
    case "finished":
      return <GamePage />;
    case "leaderboard":
      return <LeaderboardPage />;
    default:
      return <LoginPage />;
  }
}

export default function App() {
  return (
    <GameProvider>
      <Router />
    </GameProvider>
  );
}
