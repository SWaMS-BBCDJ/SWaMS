import { useNavigate } from "react-router-dom";
import { logout, getCurrentUser } from "../services/auth";
import "../styles/Header.css";
import { Settings as SettingsIcon } from "lucide-react";

function Header() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const isAdmin = user?.role === "admin";

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="header">
      <div className="header-brand">
        <img
          className="header-logo"
          src="/SWaMS_Logo.png"
          alt="SWaMS logo"
        />
        <div>
          <h1 className="header-title">SWaMS</h1>
          <p className="header-subtitle">
            Solar Water Monitoring System
          </p>
        </div>
      </div>

      <div className="header-actions">
        {isAdmin && (
          <button
            className="settings-button"
            onClick={() => navigate("/settings")}
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon className="settings-icon" strokeWidth={2} />
          </button>
        )}

        <button className="logout-button" onClick={handleLogout}>
          LOG OUT
        </button>
      </div>
    </header>
  );
}

export default Header;