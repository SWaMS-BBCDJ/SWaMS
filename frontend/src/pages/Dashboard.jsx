
import { useEffect, useMemo, useState } from "react";

import Header from "../components/Header";
import StatusBanner from "../components/StatusBanner";
import MetricCard from "../components/MetricCard";
import Alerts from "../components/Alerts";
import LogsTable from "../components/LogsTable";
import DateFilter from "../components/DateFilter";
import TrendChart from "../components/TrendChart";
import "../styles/Dashboard.css";
import LatestReading from "../components/LatestReading";

import "../styles/index.css";

const API_URL = "http://localhost:5000/api/readings/history";

/* =========================================================
   DATE FUNCTIONS
   ========================================================= */

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

function isWithinDateRange(timestamp, startDate, endDate) {
  const date = getCalendarDate(timestamp);

  return (
    !!date &&
    (!startDate || date >= startDate) &&
    (!endDate || date <= endDate)
  );
}

/* =========================================================
   SENSOR STATUS
   ========================================================= */

function getParameterStatus(parameter, value) {
  if (
    value == null ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "NOT EVALUATED";
  }

  const v = Number(value);

  if (parameter === "ph") {
    if (v < 0 || v > 14) return "NOT EVALUATED";
    if (v < 6.5 || v > 8.5) return "DANGER";
    if (v <= 6.7 || v >= 8.3) return "WARNING";
    return "SAFE";
  }

  if (parameter === "temperature") {
    if (v < -50 || v > 100) return "NOT EVALUATED";
    if (v < 24 || v > 32) return "DANGER";
    if (v <= 25 || v >= 31) return "WARNING";
    return "SAFE";
  }

  if (parameter === "turbidity") {
    if (v < 0) return "NOT EVALUATED";
    if (v < 50 || v > 100) return "DANGER";
    if (v <= 55 || v >= 95) return "WARNING";
    return "SAFE";
  }

  return "NOT EVALUATED";
}

/* =========================================================
   OVERALL WATER QUALITY STATUS
   ========================================================= */

function getOverallStatus(statuses) {
  if (statuses.includes("DANGER")) return "DANGER";

  if (statuses.includes("WARNING")) return "WARNING";

  if (statuses.every((s) => s === "SAFE")) {
    return "SAFE";
  }

  return "NOT EVALUATED";
}

/* =========================================================
   CREATE ALERTS FROM A READING
   ========================================================= */

function createAlerts(reading, statuses) {
  if (!reading) return [];

  const result = [];
  const recordedAt = reading.recordedAt;

  [
    ["PH", Number(reading.ph), statuses.phStatus, ""],

    [
      "TEMPERATURE",
      Number(reading.temperature),
      statuses.temperatureStatus,
      "°C",
    ],

    [
      "TURBIDITY",
      Number(reading.turbidity),
      statuses.turbidityStatus,
      " NTU",
    ],

  ].forEach(([parameter, value, status, unit]) => {

    if (status === "SAFE") return;

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
        status === "NOT EVALUATED"
          ? "This parameter could not be evaluated. Check the sensor reading."
          : status === "DANGER"
            ? `${parameter} is outside its configured range.`
            : `${parameter} is approaching a configured limit.`,

      recordedAt,
    });
  });

  return result;
}

/* =========================================================
   DASHBOARD COMPONENT
   ========================================================= */

function Dashboard() {

  const [readings, setReadings] = useState([]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedParameter, setSelectedParameter] =
    useState("ph");

  /* =======================================================
     FETCH SENSOR READINGS
     Refresh every 10 seconds
     ======================================================= */

  useEffect(() => {
    let active = true;

    async function fetchReadings() {
      try {
        const response = await fetch(API_URL);

        if (!response.ok) {
          throw new Error("Could not retrieve readings.");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Invalid backend response.");
        }

        if (!active) return;

        setReadings(
          data.map((r) => ({
            ...r,

            recordedAt:
              r.t ??
              r.timestamp ??
              r.recordedAt ??
              r.recorded_at ?? 
              r.created_at ??
              null,
          }))
        );

        setError("");

      } catch {
        if (active) {
          setError(
            "Unable to connect to the backend. Check that it is running."
          );
        }

      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchReadings();

    const timer = setInterval(fetchReadings, 10000);

    return () => {
      active = false;
      clearInterval(timer);
    };

  }, []);

  /* =======================================================
     LATEST SENSOR READING

     Independent of date filter.
     Always displays the newest sensor reading.
     ======================================================= */

  const latestReading = readings.length
    ? readings[readings.length - 1]
    : null;

  /* =======================================================
     DATE-FILTERED READINGS

     This is the main filtered data used by:
     1. Sensor charts
     2. Logs
     3. Alerts
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
     FILTERED LOGS

     Show only the latest 5 readings within the date range.
     ======================================================= */

  const latestLogs = useMemo(() => {

    return filteredReadings.slice(-5).reverse();

  }, [filteredReadings]);

  /* =======================================================
     LATEST SENSOR STATUS

     These statuses are based on the actual latest reading,
     not the date-filtered readings.
     ======================================================= */

  const phStatus = getParameterStatus(
    "ph",
    latestReading?.ph
  );

  const temperatureStatus = getParameterStatus(
    "temperature",
    latestReading?.temperature
  );

  const turbidityStatus = getParameterStatus(
    "turbidity",
    latestReading?.turbidity
  );

  /* =======================================================
     OVERALL STATUS
     ======================================================= */

  const overallStatus = getOverallStatus([
    phStatus,
    temperatureStatus,
    turbidityStatus,
  ]);

  /* =======================================================
     DATE-FILTERED ALERTS

     Generate alerts from ALL readings within the selected
     date range, not just the latest sensor reading.
     ======================================================= */

  const currentAlerts = useMemo(() => {

    return filteredReadings.flatMap((reading) => {

      const statuses = {

        phStatus: getParameterStatus(
          "ph",
          reading.ph
        ),

        temperatureStatus: getParameterStatus(
          "temperature",
          reading.temperature
        ),

        turbidityStatus: getParameterStatus(
          "turbidity",
          reading.turbidity
        ),

      };

      return createAlerts(reading, statuses);

    });

  }, [filteredReadings]);

  /* =======================================================
     CHART LABELS
     ======================================================= */

  const chartLabels = {
    ph: "pH READINGS",
    turbidity: "TURBIDITY READINGS",
    temperature: "TEMPERATURE READINGS",
  };

  /* =======================================================
     CLEAR DATE FILTER
     ======================================================= */

  function clearDateFilter() {
    setStartDate("");
    setEndDate("");
  }

  /* =======================================================
     DASHBOARD UI
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

        {/* ERROR MESSAGE */}

        {error && (
          <p role="alert">{error}</p>
        )}

        {/* EMPTY READINGS */}

        {!loading && !error && readings.length === 0 && (
          <p>No readings have been recorded yet.</p>
        )}

        {/* OVERALL WATER QUALITY STATUS */}

        <div className="status-summary-grid">
          <StatusBanner status={overallStatus} />

          <LatestReading reading={latestReading} />
        </div>

        {/* SENSOR METRIC CARDS */}

        <section className="live-readings">

                <h2 className="section-heading">LIVE SENSOR READINGS</h2>

          <div className="status-grid">

            <MetricCard
              title="PH"
              value={
                latestReading?.ph == null
                  ? "--"
                  : Number(latestReading.ph).toFixed(2)
              }
              status={phStatus}
            />

            <MetricCard
              title="TEMPERATURE"
              value={
                latestReading?.temperature == null
                  ? "--"
                  : Number(latestReading.temperature).toFixed(1)
              }
              unit="°C"
              status={temperatureStatus}
            />

            <MetricCard
              title="TURBIDITY"
              value={
                latestReading?.turbidity == null
                  ? "--"
                  : Number(latestReading.turbidity).toFixed(1)
              }
              unit="NTU"
              status={turbidityStatus}
            />

          </div>

        </section>

        {/* DATE FILTER */}

        <DateFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />

        {/* CLEAR FILTER */}

        {(startDate || endDate) && (
          <button
            type="button"
            className="clear-filter-button"
            onClick={clearDateFilter}
          >
            Clear Date Filter
          </button>
        )}

        {/* MAIN DASHBOARD CONTENT */}

        <section className="dashboard-content-grid">

          {/* ============================================
              LEFT COLUMN - SENSOR READINGS
              ============================================ */}

          <div className="sensor-charts-column">

            <div className="sensor-chart-section">

              {/* CHART HEADER */}

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

              {/* SENSOR TREND CHART */}

              <TrendChart
                readings={filteredReadings}
                parameter={selectedParameter}
                label={chartLabels[selectedParameter]}
              />

            </div>

          </div>

          {/* ============================================
              RIGHT COLUMN - LOGS AND ALERTS
              ============================================ */}

          <div className="monitoring-column">

            {/* LOGS */}

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

            {/* ALERTS */}

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
