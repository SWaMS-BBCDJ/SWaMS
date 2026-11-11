
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getToken, getCurrentUser } from "../services/auth";
import "../styles/Settings.css";

const API_URL = "http://localhost:5000/api";

const DEFAULTS = {
  ph: {
    safe_min: 6.5,
    safe_max: 9.0,
    warning_min: 6.0,
    warning_max: 9.5,
  },
  temperature: {
    safe_min: 27,
    safe_max: 30,
    warning_min: 26,
    warning_max: 31,
  },
  turbidity: {
    safe_min: 0,
    safe_max: 50,
    warning_min: null,
    warning_max: 60,
  },
};

const parameterInfo = [
  { key: "ph", label: "pH Level", unit: "pH" },
  { key: "temperature", label: "Temperature", unit: "°C" },
  { key: "turbidity", label: "Turbidity", unit: "NTU" },
];

function Settings() {
  const navigate = useNavigate();

  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  // Threshold states
  const [thresholds, setThresholds] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // SMS states (admin only)
  const [mobileNumber, setMobileNumber] = useState("");
  const [savingMobile, setSavingMobile] = useState(false);
  const [mobileMessage, setMobileMessage] = useState("");
  const [mobileError, setMobileError] = useState("");

  // Load thresholds for both admin and operator
  useEffect(() => {
    async function loadThresholds() {
      try {
        const response = await fetch(
          `${API_URL}/settings/thresholds`,
          {
            headers: {
              Authorization: `Bearer ${getToken()}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Failed to load thresholds"
          );
        }

        setThresholds((previous) => ({
          ...previous,
          ...data,
        }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadThresholds();
  }, []);

  // Load operator mobile number only for admin
  useEffect(() => {
    if (!isAdmin) return;

    async function loadOperatorMobile() {
      try {
        const response = await fetch(
          `${API_URL}/settings/operator-mobile`,
          {
            headers: {
              Authorization: `Bearer ${getToken()}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Failed to load operator mobile number"
          );
        }

        setMobileNumber(data.mobile_number || "");
      } catch (err) {
        setMobileError(err.message);
      }
    }

    loadOperatorMobile();
  }, [isAdmin]);

  // Save operator mobile number (admin only)
  async function saveOperatorMobile() {
    if (!isAdmin) return;

    setSavingMobile(true);
    setMobileMessage("");
    setMobileError("");

    try {
      const number = mobileNumber.trim();

      if (!/^\+639\d{9}$/.test(number)) {
        throw new Error(
          "Enter a valid Philippine mobile number in the format +639XXXXXXXXX."
        );
      }

      const response = await fetch(
        `${API_URL}/settings/operator-mobile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            mobile_number: number,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to save operator mobile number"
        );
      }

      setMobileNumber(data.mobile_number);
      setMobileMessage(data.message);
    } catch (err) {
      setMobileError(err.message);
    } finally {
      setSavingMobile(false);
    }
  }

  // Update threshold input
  function handleChange(parameter, field, value) {
    if (!isAdmin) return;

    setThresholds((previous) => ({
      ...previous,
      [parameter]: {
        ...previous[parameter],
        [field]: value,
      },
    }));

    setMessage("");
    setError("");
  }

  // Save threshold settings (admin only)
  async function saveThresholds(values) {
    if (!isAdmin) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const payload = {};

      for (const parameter of parameterInfo) {
        const range = values[parameter.key];

        const min = Number(range.safe_min);
        const max = Number(range.safe_max);

        if (
          range.safe_min === "" ||
          range.safe_max === "" ||
          !Number.isFinite(min) ||
          !Number.isFinite(max) ||
          min >= max
        ) {
          throw new Error(
            `Please enter a valid minimum and maximum for ${parameter.label}.`
          );
        }

        const warningMin =
          range.warning_min === "" || range.warning_min == null
            ? null
            : Number(range.warning_min);

        const warningMax =
          range.warning_max === "" || range.warning_max == null
            ? null
            : Number(range.warning_max);

        if (
          (warningMin !== null && !Number.isFinite(warningMin)) ||
          (warningMax !== null && !Number.isFinite(warningMax)) ||
          (warningMin !== null && warningMin > min) ||
          (warningMax !== null && warningMax < max)
        ) {
          throw new Error(
            `Warning limits for ${parameter.label} must include the safe range.`
          );
        }

        payload[parameter.key] = {
          safe_min: min,
          safe_max: max,
          warning_min: warningMin,
          warning_max: warningMax,
        };
      }

      const response = await fetch(
        `${API_URL}/settings/thresholds`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to save settings"
        );
      }

      setMessage("Threshold settings saved successfully!");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Restore default thresholds (admin only)
  function restoreDefaults() {
    if (!isAdmin) return;

    const confirmed = window.confirm(
      "Restore the default SWaMS threshold values?"
    );

    if (confirmed) {
      setThresholds(DEFAULTS);
      saveThresholds(DEFAULTS);
    }
  }

  if (loading) {
    return (
      <main className="settings-main">
        <p className="settings-description">
          Loading settings...
        </p>
      </main>
    );
  }

  return (
    <main className="settings-main">

      {/* PAGE HEADER */}
      <header className="settings-header">
        <div>
          <button
            className="settings-button settings-button-secondary"
            onClick={() => navigate("/")}
          >
            ← Back to Dashboard
          </button>
        </div>

        <h1 className="settings-title">
          System Settings
        </h1>

        <p className="settings-description">
          Configure your SWaMS water-quality monitoring system.
        </p>
      </header>

      {/* TWO-COLUMN LAYOUT */}
      <div className="settings-grid">

        {/* THRESHOLD MANAGEMENT */}
        <section className="settings-card">

          <div className="settings-card-header">
            <h2 className="settings-card-title">
              Alert Threshold Management
            </h2>

            <p className="settings-card-description">
              {isAdmin
                ? "Set the acceptable minimum and maximum values for each water-quality parameter."
                : "View the acceptable minimum and maximum values for each water-quality parameter."}
            </p>

            {!isAdmin && (
              <p className="settings-help">
                You have view-only access to these settings.
                Contact an administrator to make changes.
              </p>
            )}
          </div>

          <div className="settings-form">
            {parameterInfo.map((parameter) => (
              <div
                className="settings-parameter"
                key={parameter.key}
              >
                <h3 className="settings-label">
                  {parameter.label}
                </h3>

              <div className="settings-range-grid">

              <label className="settings-field">
                <span className="settings-label">
                  Safe Minimum ({parameter.unit})
                </span>
                <input
                  className="settings-input"
                  type="number"
                  step="any"
                  value={thresholds[parameter.key]?.safe_min ?? ""}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    handleChange(parameter.key, "safe_min", e.target.value)
                  }
                />
              </label>

              <label className="settings-field">
                <span className="settings-label">
                  Safe Maximum ({parameter.unit})
                </span>
                <input
                  className="settings-input"
                  type="number"
                  step="any"
                  value={thresholds[parameter.key]?.safe_max ?? ""}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    handleChange(parameter.key, "safe_max", e.target.value)
                  }
                />
              </label>

              <label className="settings-field">
                <span className="settings-label">
                  Warning Minimum ({parameter.unit})
                </span>
                <input
                  className="settings-input"
                  type="number"
                  step="any"
                  value={thresholds[parameter.key]?.warning_min ?? ""}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    handleChange(parameter.key, "warning_min", e.target.value)
                  }
                />
              </label>

              <label className="settings-field">
                <span className="settings-label">
                  Warning Maximum ({parameter.unit})
                </span>
                <input
                  className="settings-input"
                  type="number"
                  step="any"
                  value={thresholds[parameter.key]?.warning_max ?? ""}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    handleChange(parameter.key, "warning_max", e.target.value)
                  }
                />
              </label>

            </div>
              </div>
            ))}
          </div>

          {isAdmin && message && (
            <p className="settings-message settings-message-success">
              ✓ {message}
            </p>
          )}

          {error && (
            <p className="settings-message settings-message-error">
              {error}
            </p>
          )}

          {/* ADMIN-ONLY BUTTONS */}
          {isAdmin && (
            <div className="settings-actions">
              <button
                className="settings-button settings-button-primary"
                onClick={() => saveThresholds(thresholds)}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button
                className="settings-button settings-button-secondary"
                onClick={restoreDefaults}
                disabled={saving}
              >
                Restore Defaults
              </button>
            </div>
          )}

        </section>

        {/* SMS SETTINGS - ADMIN AND OPERATOR */}
        <section className="settings-card">

          <div className="settings-card-header">
            <h2 className="settings-card-title">
              SMS Notification Settings
            </h2>

            <p className="settings-card-description">
              Configure the operator's mobile number that will
              receive water-quality alert notifications.
            </p>

            {!isAdmin && (
              <p className="settings-help">
                You have view-only access to these settings.
                Contact an administrator to make changes.
              </p>
            )}
          </div>

          <div className="settings-form">
            <label className="settings-field">
              <span className="settings-label">
                Operator Mobile Number
              </span>

              <input
                className="settings-input"
                type="tel"
                placeholder="+639XXXXXXXXX"
                value={mobileNumber}
                disabled={!isAdmin}
                onChange={(e) => {
                  setMobileNumber(e.target.value);
                  setMobileMessage("");
                  setMobileError("");
                }}
              />

              <span className="settings-help">
                Use Philippine international format, for example:
                +639XXXXXXXXX.
              </span>
            </label>
          </div>

          {isAdmin && mobileMessage && (
            <p className="settings-message settings-message-success">
              ✓ {mobileMessage}
            </p>
          )}

          {isAdmin && mobileError && (
            <p className="settings-message settings-message-error">
              {mobileError}
            </p>
          )}

          {isAdmin && (
            <div className="settings-actions">
              <button
                className="settings-button settings-button-primary"
                onClick={saveOperatorMobile}
                disabled={savingMobile}
              >
                {savingMobile ? "Saving..." : "Save Mobile Number"}
              </button>
            </div>
          )}

        </section>

      </div>
    </main>
  );
}

export default Settings;
