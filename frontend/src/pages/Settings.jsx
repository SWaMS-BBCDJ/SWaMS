
import { useNavigate } from "react-router-dom";

function Settings() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: "24px" }}>
      <h1>System Settings</h1>
      <p>Configure your SWaMS system here.</p>

      <button onClick={() => navigate("/")}>
        Back to Dashboard
      </button>
    </div>
  );
}

export default Settings;
