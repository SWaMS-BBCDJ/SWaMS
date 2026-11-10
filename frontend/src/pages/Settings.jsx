
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getToken } from "../services/auth";

const API_URL = "http://localhost:5000/api";

const DEFAULTS = {
  ph: { safe_min: 6.5, safe_max: 9.0 },
  temperature: { safe_min: 27, safe_max: 30 },
  turbidity: { safe_min: 0, safe_max: 50 },
};

const parameterInfo = [
  { key: "ph", label: "pH Level", unit: "pH" },
  { key: "temperature", label: "Temperature", unit: "°C" },
  { key: "turbidity", label: "Turbidity", unit: "NTU" },
];

function Settings() {
  const navigate = useNavigate();

  const [thresholds, setThresholds] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Load saved thresholds
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
          throw new Error(data.message || "Failed to load settings");
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

  function handleChange(parameter, field, value) {
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

  async function saveThresholds(values) {
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

        payload[parameter.key] = {
          safe_min: min,
          safe_max: max,
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
        throw new Error(data.message || "Unable to save settings");
      }

      setMessage("Threshold settings saved successfully!");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    const confirmed = window.confirm(
      "Restore the default SWaMS threshold values?"
    );

    if (confirmed) {
      setThresholds(DEFAULTS);
      saveThresholds(DEFAULTS);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "11px",
    border: "1px solid #D1D5DB",
    borderRadius: "7px",
    fontSize: "15px",
    marginTop: "6px",
  };

  if (loading) {
    return <div style={{ padding: "30px" }}>Loading settings...</div>;
  }

  return (
    <div style={{
      minHeight: "100vh",
      padding: "30px",
      background: "#D2DFE4",
    }}>
      <div style={{
        maxWidth: "1000px",
        margin: "0 auto",
      }}>

        <button
          onClick={() => navigate("/")}
          style={{
            padding: "10px 16px",
            border: "none",
            borderRadius: "7px",
            cursor: "pointer",
            marginBottom: "20px",
          }}
        >
          ← Back to Dashboard
        </button>

        <h1 style={{ marginBottom: "8px" }}>
          System Settings
        </h1>

        <p style={{ color: "#64748B", marginBottom: "25px" }}>
          Configure your SWaMS water-quality monitoring system.
        </p>

        <section style={{
          background: "#FFFFFF",
          padding: "25px",
          borderRadius: "12px",
          boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
        }}>

          <h2 style={{ marginTop: 0 }}>
            Alert Threshold Management
          </h2>

          <p style={{ color: "#64748B" }}>
            Set the acceptable minimum and maximum values
            for each water-quality parameter.
          </p>

          {parameterInfo.map((parameter) => (
            <div
              key={parameter.key}
              style={{
                padding: "20px 0",
                borderBottom: "1px solid #E2E8F0",
              }}
            >
              <h3 style={{ marginTop: 0 }}>
                {parameter.label}
              </h3>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "20px",
              }}>
                <label>
                  Minimum ({parameter.unit})
                  <input
                    type="number"
                    step="any"
                    value={thresholds[parameter.key]?.safe_min ?? ""}
                    onChange={(e) =>
                      handleChange(
                        parameter.key,
                        "safe_min",
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  />
                </label>

                <label>
                  Maximum ({parameter.unit})
                  <input
                    type="number"
                    step="any"
                    value={thresholds[parameter.key]?.safe_max ?? ""}
                    onChange={(e) =>
                      handleChange(
                        parameter.key,
                        "safe_max",
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>
          ))}

          {message && (
            <p style={{ color: "green", marginTop: "20px" }}>
              ✓ {message}
            </p>
          )}

          {error && (
            <p style={{ color: "red", marginTop: "20px" }}>
              {error}
            </p>
          )}

          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "25px",
          }}>
            <button
              onClick={() => saveThresholds(thresholds)}
              disabled={saving}
              style={{
                padding: "12px 22px",
                background: "#28734D",
                color: "white",
                border: "none",
                borderRadius: "7px",
                cursor: "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <button
              onClick={restoreDefaults}
              disabled={saving}
              style={{
                padding: "12px 22px",
                background: "#E5E7EB",
                color: "#1F2937",
                border: "none",
                borderRadius: "7px",
                cursor: "pointer",
              }}
            >
              Restore Defaults
            </button>
          </div>

        </section>
      </div>
    </div>
  );
}

export default Settings;
