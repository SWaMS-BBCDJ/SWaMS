import '../styles/MetricCard.css';
function MetricCard({
  title,
  value,
  unit = "",
  status = "SAFE",
}) {
  const normalizedStatus = String(status)
    .toLowerCase()
    .replace(/\s+/g, "-");

  const statusClass =
    normalizedStatus === "safe"
      ? "safe"
      : normalizedStatus === "warning"
        ? "warning"
        : normalizedStatus === "danger"
          ? "danger"
          : "not-evaluated";

  return (
    <div className={`status-card ${statusClass}`}>
      <div className="status-card-title">
        {title}
      </div>

      <div className="status-card-value">
        {value}

        {unit && (
          <span className="status-card-unit">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export default MetricCard;
