
import "../styles/Alerts.css";

/* Format timestamps using Philippine time.
   Backend timestamps are stored as UTC without a timezone suffix. */
function splitDateTime(recordedAt) {
  if (!recordedAt) {
    return { date: "Time unavailable", time: "" };
  }

  const timestamp = /Z$|[+-]\d{2}:\d{2}$/.test(recordedAt)
    ? recordedAt
    : `${recordedAt}Z`;

  const d = new Date(timestamp);

  if (Number.isNaN(d.getTime())) {
    return { date: "Time unavailable", time: "" };
  }

  return {
    date: d.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "numeric",
      day: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("en-PH", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }),
  };
}

function Alerts({ alerts = [] }) {
  return (
    <div className="alert-list">
      {alerts.length === 0 ? (
        <div className="no-alerts">
          <div className="no-alerts-main">SAFE</div>
          <div className="no-alerts-subtitle">
            No configured threshold violations detected
          </div>
        </div>
      ) : (
        alerts.map((incident) => {
          const { date, time } = splitDateTime(
            incident.detected_at
          );

          // Get parameters that have not recovered yet
          const unrecoveredParameters = (
            incident.parameters || []
          ).filter(
            (parameter) => !parameter.recovered_at
          );

          // Check remaining abnormal parameters
          const hasCritical = unrecoveredParameters.some(
            (parameter) => parameter.severity === "CRITICAL"
          );

          const hasWarning = unrecoveredParameters.some(
            (parameter) => parameter.severity === "WARNING"
          );

          // Determine incident status color
          const statusClass =
            incident.status === "RECOVERED"
              ? "recovered"
              : hasCritical
                ? "active"
                : hasWarning
                  ? "warning"
                  : "active";

          return (
            <div className="alert-group" key={incident.id}>
              {/* LEFT: Date, time and incident status */}
              <div className="alert-group-time">
                <div className="alert-group-date">
                  {date}
                </div>

                {time && (
                  <div className="alert-group-clock">
                    {time}
                  </div>
                )}

                <div className={`alert-group-status ${statusClass}`}>
                  {incident.status}
                </div>
              </div>

              {/* RIGHT: Incident details */}
              <div className="alert-group-body">

              {/* Incident number and acknowledgment indicator */}
              <div className="alert-incident-heading">

                <span className="alert-incident-id">
                  INC-{String(incident.id).padStart(3, "0")}
                </span>

                {incident.acknowledged_at && (
                  <span className="alert-acknowledged">
                    ACKNOWLEDGED
                  </span>
                )}

              </div>

                {incident.parameters?.map((parameter) => {
                  // Recovered parameters always appear gray
                  const severity = parameter.recovered_at
                    ? "recovered"
                    : parameter.severity === "CRITICAL"
                      ? "danger"
                      : parameter.severity === "WARNING"
                        ? "warning"
                        : "";

                  return (
                    <div
                      className={`alert-item alert-${severity}`}
                      key={parameter.parameter}
                    >
                      <div className="alert-item-header">
                        <span className="alert-parameter">
                          {parameter.parameter}
                        </span>

                        <span className="alert-value">
                          {parameter.latest_value}
                          {parameter.parameter === "temperature"
                            ? " °C"
                            : parameter.parameter === "turbidity"
                              ? " NTU"
                              : ""}
                        </span>
                      </div>

                      <p className="alert-message">
                        {parameter.recovered_at
                          ? "RECOVERED"
                          : `Severity: ${parameter.severity} | Direction: ${parameter.direction}`}
                      </p>

                      {parameter.recovered_at && (
                        <p className="alert-message">
                          Parameter recovered:{" "}
                          {splitDateTime(parameter.recovered_at).time}
                        </p>
                      )}
                    </div>
                  );
                })}

                {incident.acknowledged_at && (
                  <p className="alert-message">
                    Acknowledged:{" "}
                    {splitDateTime(incident.acknowledged_at).time}
                  </p>
                )}

                {incident.recovered_at && (
                  <p className="alert-message">
                    Incident recovered:{" "}
                    {splitDateTime(incident.recovered_at).time}
                  </p>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default Alerts;
