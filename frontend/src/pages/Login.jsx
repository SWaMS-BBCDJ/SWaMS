
import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { login, isAuthenticated } from "../services/auth";
import "../styles/global.css";
import "../styles/Login.css";

function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);

      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        
        <div className="login-brand">
          <img
            className="login-logo"
            src="public/SWaMS_Logo.png"
            alt="SWaMS logo"
          />

          <h1 className="login-title">SWaMS</h1>
        </div>

        <label className="login-label" htmlFor="username">
          USERNAME
        </label>

        <input
          id="username"
          className="login-input"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <label className="login-label" htmlFor="password">
          PASSWORD
        </label>

        <input
          id="password"
          className="login-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="login-button"
          type="submit"
          disabled={loading}
        >
          {loading ? "LOGGING IN..." : "LOG IN"}
        </button>

      </form>
    </main>
  );
}

export default Login;
