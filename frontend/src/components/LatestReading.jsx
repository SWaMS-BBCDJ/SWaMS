
function LatestReading({ timestamp }) {
  const readingDate = timestamp ? new Date(timestamp) : null;

  const isValidDate =
    readingDate && !isNaN(readingDate.getTime());

  const formattedDate = isValidDate
    ? readingDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "No readings available";

  const formattedTime = isValidDate
    ? readingDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--:--:--";

  return (
    <section className="latest-reading-container">
      <div className="latest-reading-box">

        <span className="latest-reading-label">
          LATEST SENSOR READING
        </span>

        <span className="latest-reading-date">
          {formattedDate}
        </span>

        <span className="latest-reading-time">
          {formattedTime}
        </span>

      </div>
    </section>
  );
}

export default LatestReading;
