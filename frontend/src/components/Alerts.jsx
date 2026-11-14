
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

          const statusClass =
            incident.status === "ACTIVE"
              ? "active"
              : "recovered";

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
                <div className="alert-item-header">
                  INC-{String(incident.id).padStart(3, "0")}
                </div>

                {incident.parameters?.map((parameter) => {
                  const severity =
                    parameter.severity === "CRITICAL"
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
                        Severity: {parameter.severity}
                        {" | "}
                        Direction: {parameter.direction}
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
