
import { useEffect, useMemo, useState } from "react";

// Dashboard components
import Header from "../components/Header";
import StatusBanner from "../components/StatusBanner";
import MetricCard from "../components/MetricCard";
import Alerts from "../components/Alerts";
import LogsTable from "../components/LogsTable";
import DateFilter from "../components/DateFilter";
import TrendChart from "../components/TrendChart";
import LatestReading from "../components/LatestReading";

// Dashboard styles
import "../styles/Dashboard.css";
import "../styles/index.css";

// Backend API functions
import {
  getReadingHistory,
  getLatestReading,
  getThresholds,
} from "../services/api";


/* =========================================================
   1. DATE FUNCTIONS
   ========================================================= */

// Convert timestamps into YYYY-MM-DD format.
function getCalendarDate(timestamp) {
  if (!timestamp) return "";

  const value = String(timestamp);

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

// Check if a reading belongs to the selected date range.
function isWithinDateRange(timestamp, startDate, endDate) {
  const date = getCalendarDate(timestamp);

  return (
    !!date &&
    (!startDate || date >= startDate) &&
    (!endDate || date <= endDate)
  );
}


/* =========================================================
   2. SENSOR STATUS CALCULATION
   ========================================================= */

// Compare sensor readings with database thresholds.
function getParameterStatus(parameter, value, limits) {
  if (
    value == null ||
    value === "" ||
    !Number.isFinite(Number(value)) ||
    !limits
  ) {
    return "NOT EVALUATED";
  }

  const v = Number(value);
  const min = Number(limits.safe_min);
  const max = Number(limits.safe_max);

  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min >= max
  ) {
    return "NOT EVALUATED";
  }

  // Validate physical sensor values.
  if (parameter === "ph" && (v < 0 || v > 14)) {
    return "NOT EVALUATED";
  }

  if (parameter === "temperature" && (v < -50 || v > 100)) {
    return "NOT EVALUATED";
  }

  if (parameter === "turbidity" && v < 0) {
    return "NOT EVALUATED";
  }

  // Safe: within configured safe range.
  if (v >= min && v <= max) {
    return "SAFE";
  }

  // Warning boundaries.
  const warningMin =
    limits.warning_min == null || limits.warning_min === ""
      ? null
      : Number(limits.warning_min);

  const warningMax =
    limits.warning_max == null || limits.warning_max === ""
      ? null
      : Number(limits.warning_max);

  // Warning: outside safe range but within warning boundaries.
  if (
    (v < min && (warningMin === null || v >= warningMin)) ||
    (v > max && (warningMax === null || v <= warningMax))
  ) {
    return "WARNING";
  }

  // Critical: beyond configured warning boundaries.
  return "DANGER";
}


/* =========================================================
   3. OVERALL WATER QUALITY STATUS
   ========================================================= */

function getOverallStatus(statuses) {

  if (statuses.includes("DANGER")) {
    return "DANGER";
  }

  if (statuses.includes("WARNING")) {
    return "WARNING";
  }

  if (statuses.every((status) => status === "SAFE")) {
    return "SAFE";
  }

  return "NOT EVALUATED";
}


/* =========================================================
   4. GENERATE ALERTS
   ========================================================= */

// Create alerts from individual sensor readings.
function createAlerts(reading, statuses) {

  if (!reading) return [];

  const result = [];
  const recordedAt = reading.recordedAt;

  const parameters = [
    [
      "PH",
      reading.ph,
      statuses.phStatus,
      "",
    ],
    [
      "TEMPERATURE",
      reading.temperature,
      statuses.temperatureStatus,
      "°C",
    ],
    [
      "TURBIDITY",
      reading.turbidity,
      statuses.turbidityStatus,
      " NTU",
    ],
  ];

  parameters.forEach(([parameter, rawValue, status, unit]) => {

    if (status === "SAFE" || status === "NOT EVALUATED") return;

    const value = Number(rawValue);

    // CHANGED: Do not format invalid sensor values with toFixed().
    const shown =
      status === "NOT EVALUATED"
        ? "--"
        : parameter === "PH"
          ? value.toFixed(2)
          : `${value.toFixed(1)}${unit}`;

    result.push({

      id: `${parameter}-${recordedAt}`,

      parameter,

      value: shown,

      severity:
        status === "DANGER"
          ? "danger"
          : "warning",

      message:
      status === "DANGER"
        ? `${parameter} has exceeded the configured warning limits. Immediate attention is required.`
        : `${parameter} is outside the safe range and requires monitoring.`,

    });

  });

  return result;
}


/* =========================================================
   5. DASHBOARD COMPONENT
   ========================================================= */

function Dashboard() {

  // Sensor readings from Flask.
  const [readings, setReadings] = useState([]);

  // Latest live reading from the LiveReading database table.
  const [latestLiveReading, setLatestLiveReading] = useState(null);

  // Error specifically for the live-reading connection.
  const [liveError, setLiveError] = useState("");

  // Thresholds from Flask database.
  const [thresholds, setThresholds] = useState(null);

  // Loading and error messages.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [thresholdError, setThresholdError] = useState("");

  // Date filter states.
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Selected historical sensor chart.
  const [selectedParameter, setSelectedParameter] =
    useState("ph");


  /* =======================================================
     6. FETCH SENSOR READINGS

     CHANGED:
     Uses getReadingHistory() from services/api.js.

     Endpoint:
     GET /api/readings/history

     Automatically refreshes every 10 seconds.
     ======================================================= */

  useEffect(() => {

    let active = true;

    async function fetchReadings() {

      try {

        const data = await getReadingHistory();

        if (!Array.isArray(data)) {
          throw new Error("Invalid backend response.");
        }

        if (!active) return;

        // Normalize the timestamp field.
        const normalizedReadings = data.map((reading) => ({

          ...reading,

          recordedAt:
            reading.t ??
            reading.timestamp ??
            reading.recordedAt ??
            reading.recorded_at ??
            reading.created_at ??
            null,

        }));

        // Sort readings from oldest to newest.
        normalizedReadings.sort((a, b) => {

          return (
            new Date(a.recordedAt).getTime() -
            new Date(b.recordedAt).getTime()
          );

        });

        setReadings(
          data
            .map((r) => ({
              ...r,
              recordedAt:
                r.t ??
                r.timestamp ??
                r.recordedAt ??
                r.recorded_at ??
                r.created_at ??
                null,
            }))
            .filter((r) => r.recordedAt)
            .sort(
              (a, b) =>
                new Date(a.recordedAt) - new Date(b.recordedAt)
            )
        );

        setError("");

      } catch (error) {

        if (active) {

          setError(
            "Unable to retrieve sensor readings: " +
            error.message
          );

        }

      } finally {

        if (active) {
          setLoading(false);
        }

      }

    }

    // Fetch immediately when dashboard opens.
    fetchReadings();

    // Refresh every 10 seconds.
    const timer = setInterval(fetchReadings, 10000);

    return () => {

      active = false;

      clearInterval(timer);

    };

  }, []);


  /* =======================================================
     7. FETCH SENSOR THRESHOLDS

     CHANGED:
     Uses getThresholds() from services/api.js.

     Endpoint:
     GET /api/settings/thresholds

     This is a separate useEffect.
     Do not place another useEffect inside it.
     ======================================================= */

  useEffect(() => {

    let active = true;

    async function fetchThresholds() {

      try {

        const data = await getThresholds();
        console.log(
          "THRESHOLDS FROM BACKEND:",
          JSON.stringify(data, null, 2)
        );

        if (active) {

          setThresholds(data);

          setThresholdError("");

        }

      } catch (error) {

        if (active) {

          setThresholdError(error.message);

        }

      }

    }

    fetchThresholds();

    return () => {

      active = false;

    };

  }, []);


  /* =======================================================
     8. GET LATEST SENSOR READING

     Independent of date filtering.
     Always uses the newest historical reading.
     ======================================================= */

  
/* =======================================================
   8. LATEST LIVE SENSOR READING

   Uses the separate LiveReading endpoint instead of
   relying on historical hourly records.

   The latest values remain visible even if the sensor
   stops sending data. The status indicates whether
   the latest reading is still considered live.
   ======================================================= */

  const liveReading = latestLiveReading;
  useEffect(() => {
    let active = true;

    async function fetchLatestReading() {
      try {
        const data = await getLatestReading();

        if (active) {
          setLatestLiveReading(data);
          setLiveError("");
        }
      } catch (error) {
        if (active) {
          setLiveError(error.message);
        }
      }
    }

    fetchLatestReading();

    const timer = setInterval(fetchLatestReading, 10000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const latestReadingAge = liveReading?.timestamp
    ? Date.now() - new Date(liveReading.timestamp).getTime()
    : Infinity;

  // A reading received within 30 seconds is considered live.
  const isReceivingReadings =
    Number.isFinite(latestReadingAge) &&
    latestReadingAge >= 0 &&
    latestReadingAge <= 30000;

  const latestReadingStatus = isReceivingReadings
    ? "receiving"
    : "not-receiving";


  /* =======================================================
     9. DATE-FILTERED SENSOR READINGS

     Used by:
     - Historical chart
     - Logs
     - Alerts

     Does not affect live sensor readings.
     ======================================================= */

  const filteredReadings = useMemo(() => {

    return readings.filter((reading) =>

      isWithinDateRange(
        reading.recordedAt,
        startDate,
        endDate
      )

    );

  }, [readings, startDate, endDate]);


  /* =======================================================
     10. LATEST FIVE LOG RECORDS
     ======================================================= */

  const latestLogs = useMemo(() => {

    return [...filteredReadings]

      .sort((a, b) => {

        return (
          new Date(b.recordedAt).getTime() -
          new Date(a.recordedAt).getTime()
        );

      })

      .slice(0, 5);

  }, [filteredReadings]);


  /* =======================================================
     11. LATEST SENSOR STATUS

     Compare the latest readings with database thresholds.
     ======================================================= */

  
  const phStatus = getParameterStatus(
    "ph",
    isReceivingReadings ? liveReading?.ph : null,
    thresholds?.ph
  );

  const temperatureStatus = getParameterStatus(
    "temperature",
    isReceivingReadings ? liveReading?.temperature : null,
    thresholds?.temperature
  );

  const turbidityStatus = getParameterStatus(
    "turbidity",
    isReceivingReadings ? liveReading?.turbidity : null,
    thresholds?.turbidity
  );


  /* =======================================================
     12. OVERALL WATER QUALITY STATUS
     ======================================================= */

  const overallStatus = !isReceivingReadings
    ? "NOT EVALUATED"
    : getOverallStatus([
        phStatus,
        temperatureStatus,
        turbidityStatus,
      ]);


  /* =======================================================
     13. GENERATE DATE-FILTERED ALERTS

     Checks all readings within the selected date range.
     ======================================================= */

  const currentAlerts = useMemo(() => {

    return filteredReadings.flatMap((reading) => {

      const statuses = {

        phStatus: getParameterStatus(
          "ph",
          reading.ph,
          thresholds?.ph
        ),

        temperatureStatus: getParameterStatus(
          "temperature",
          reading.temperature,
          thresholds?.temperature
        ),

        turbidityStatus: getParameterStatus(
          "turbidity",
          reading.turbidity,
          thresholds?.turbidity
        ),

      };

      return createAlerts(reading, statuses);

    });

  }, [filteredReadings, thresholds]);


  /* =======================================================
     14. CHART LABELS
     ======================================================= */

  const chartLabels = {

    ph: "pH READINGS",

    turbidity: "TURBIDITY READINGS",

    temperature: "TEMPERATURE READINGS",

  };


  /* =======================================================
     15. CLEAR DATE FILTER
     ======================================================= */

  function clearDateFilter() {

    setStartDate("");

    setEndDate("");

  }


  /* =======================================================
     16. DASHBOARD UI
     ======================================================= */

  return (

    <div className="app">

      <main className="dashboard-main">

        {/* HEADER */}
        <Header />


        {/* LOADING MESSAGE */}
        {loading && (
          <p>Loading water-quality readings...</p>
        )}


        {/* SENSOR READING ERROR */}
        {error && (
          <p role="alert">
            {error}
          </p>
        )}


        {/* THRESHOLD ERROR */}
        {thresholdError && (
          <p role="alert">
            Unable to load thresholds: {thresholdError}
          </p>
        )}


        {/* EMPTY READINGS */}
        {!loading && !error && readings.length === 0 && (
          <p>No readings have been recorded yet.</p>
        )}


        {/* ============================================
            OVERALL WATER QUALITY STATUS
            ============================================ */}

        <div className="status-summary-grid">

          <StatusBanner status={overallStatus} />

          <LatestReading
            reading={liveReading}
            status={latestReadingStatus}
          />

        </div>


        {/* ============================================
            LIVE SENSOR READINGS
            ============================================ */}

        <section className="live-readings">
          {liveError && (
            <p role="alert">
              {liveError}
            </p>
          )}

          <h2 className="section-heading">
            LIVE SENSOR READINGS
          </h2>

          <div className="status-grid">

            <MetricCard
              title="PH"
              value={
                liveReading?.ph == null
                  ? "--"
                  : Number(liveReading.ph).toFixed(2)
              }
              status={phStatus}
            />


            <MetricCard
              title="TEMPERATURE"
              value={
                liveReading?.temperature == null
                  ? "--"
                  : Number(liveReading.temperature).toFixed(1)
              }
              unit="°C"
              status={temperatureStatus}
            />


            <MetricCard
              title="TURBIDITY"
              value={
                liveReading?.turbidity == null
                  ? "--"
                  : Number(liveReading.turbidity).toFixed(1)
              }
              unit="NTU"
              status={turbidityStatus}
            />

          </div>

        </section>


        {/* ============================================
            DATE FILTER
            ============================================ */}

        <DateFilter

          startDate={startDate}

          endDate={endDate}

          onStartDateChange={setStartDate}

          onEndDateChange={setEndDate}

        />


        {/* CLEAR DATE FILTER */}
        {(startDate || endDate) && (

          <button
            type="button"
            className="clear-filter-button"
            onClick={clearDateFilter}
          >
            Clear Date Filter
          </button>

        )}


        {/* ============================================
            MAIN DASHBOARD CONTENT
            ============================================ */}

        <section className="dashboard-content-grid">


          {/* ==========================================
              LEFT COLUMN - HISTORICAL CHARTS
              ========================================== */}

          <div className="sensor-charts-column">

            <div className="sensor-chart-section">

              <div className="sensor-chart-header">

                <div className="sensor-chart-heading">

                  <h2>HISTORICAL READINGS</h2>

                  <p>
                    Monitor historical water quality measurements
                  </p>

                </div>


                {/* SENSOR SELECTOR */}
                <div className="sensor-selector">

                  <button
                    type="button"
                    className={
                      selectedParameter === "ph"
                        ? "active"
                        : ""
                    }
                    onClick={() => setSelectedParameter("ph")}
                  >
                    pH
                  </button>


                  <button
                    type="button"
                    className={
                      selectedParameter === "turbidity"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setSelectedParameter("turbidity")
                    }
                  >
                    Turbidity
                  </button>


                  <button
                    type="button"
                    className={
                      selectedParameter === "temperature"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setSelectedParameter("temperature")
                    }
                  >
                    Temperature
                  </button>

                </div>

              </div>


              {/* HISTORICAL SENSOR TREND CHART */}
              <TrendChart

                readings={filteredReadings}

                parameter={selectedParameter}

                label={chartLabels[selectedParameter]}

              />

            </div>

          </div>


          {/* ==========================================
              RIGHT COLUMN - LOGS AND ALERTS
              ========================================== */}

          <div className="monitoring-column">


            {/* ========================================
                LOGS
                ======================================== */}

            <div className="panel dashboard-logs-panel">

              <div className="panel-header">

                <h2 className="panel-title">
                  LOGS
                </h2>

                <span className="panel-count">
                  {latestLogs.length} RECORDS
                </span>

              </div>

              <LogsTable readings={latestLogs} />

              {latestLogs.length === 0 && (

                <p className="filter-empty-message">
                  No logs found for the selected date range.
                </p>

              )}

            </div>


            {/* ========================================
                ALERTS
                ======================================== */}

            <div className="panel dashboard-alerts-panel">

              <div className="panel-header">

                <h2 className="panel-title">
                  ALERTS
                </h2>

                <span className="panel-count">
                  {currentAlerts.length} ALERTS
                </span>

              </div>

              <Alerts alerts={currentAlerts} />

              {currentAlerts.length === 0 && (

                <p className="filter-empty-message">
                  No alerts found for the selected date range.
                </p>

              )}

            </div>

          </div>

        </section>

      </main>

    </div>

  );

}

export default Dashboard;
