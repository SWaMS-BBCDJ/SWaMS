import "../styles/Alerts.css";

/* Split a timestamp into a date line and a time line */
function splitDateTime(recordedAt) {
  const d = recordedAt ? new Date(recordedAt) : null;

  if (!d || Number.isNaN(d.getTime())) {
    return { date: "Time unavailable", time: "" };
  }

  return {
    date: d.toLocaleDateString("en-US"),  // 11/7/2026
    time: d.toLocaleTimeString("en-US"),  // 11:21:05 AM
  };
}

function Alerts({ alerts = [] }) {
  const groupedAlerts = Object.values(
    alerts.reduce((groups, alert) => {
      const key = alert.recordedAt || alert.id;

      if (!groups[key]) {
        groups[key] = {
          recordedAt: alert.recordedAt,
          items: [],
        };
      }

      groups[key].items.push(alert);
      return groups;
    }, {})
  ).reverse();

  return (
    <div className="alert-list">
      {groupedAlerts.length === 0 ? (
        <div className="no-alerts">
          <div className="no-alerts-main">SAFE</div>
          <div className="no-alerts-subtitle">
            No configured threshold violations detected
          </div>
        </div>
      ) : (
        groupedAlerts.map((group, index) => {
          const { date, time } = splitDateTime(group.recordedAt);

          return (
            <div className="alert-group" key={group.recordedAt || index}>

              {/* LEFT: date on top, time below */}
              <div className="alert-group-time">
                <div className="alert-group-date">{date}</div>
                {time && <div className="alert-group-clock">{time}</div>}
              </div>

              {/* RIGHT: count + alerts */}
              <div className="alert-group-body">

                {group.items.map((alert) => {
                  const severity =
                    alert.severity === "danger" ? "danger" : "warning";

                  return (
                    <div
                      className={`alert-item alert-${severity}`}
                      key={alert.id}
                    >
                      <div className="alert-item-header">
                        <span className="alert-parameter">
                          {alert.parameter}
                        </span>

                        <span className="alert-value">
                          {alert.value}
                        </span>
                      </div>

                      <p className="alert-message">
                        {alert.message}
                      </p>
                    </div>
                  );
                })}
              </div>

            </div>
          );
        })
      )}
    </div>
  );
}

export default Alerts;