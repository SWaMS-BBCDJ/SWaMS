import { useEffect, useState } from "react";
import { getReadingHistory } from "../services/api";

export default function ApiTest() {
  const [readings, setReadings] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getReadingHistory()
      .then(setReadings)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p>Connection error: {error}</p>;

  if (readings === null) return <p>Loading SWaMS readings...</p>;

  return (
    <pre>{JSON.stringify(readings, null, 2)}</pre>
  );
}