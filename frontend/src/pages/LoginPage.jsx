import { useState } from "react";
import { useGame } from "../hooks/useGame";
import styles from "./LoginPage.module.css";

export default function LoginPage() {
  const { login, state } = useGame();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    setLoading(true);
    await login(trimmed);
    setLoading(false);
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.x}>X</span>
          <span className={styles.divider}>/</span>
          <span className={styles.o}>O</span>
        </div>

        <h1 className={styles.title}>Tic-Tac-Toe</h1>
        <p className={styles.subtitle}>Multiplayer · Real-time · Server-authoritative</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="username">
            Choose a username
          </label>
          <input
            id="username"
            className={styles.input}
            type="text"
            placeholder="e.g. player1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={32}
            autoFocus
            disabled={loading}
          />

          {state.error && (
            <p className={styles.error}>{state.error}</p>
          )}

          <button
            className={styles.btn}
            type="submit"
            disabled={loading || !username.trim()}
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : (
              "Enter Game"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
