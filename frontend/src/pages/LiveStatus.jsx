import { useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import StatusBanner from "../components/StatusBanner";
import MetricCard from "../components/MetricCard";
import Alerts from "../components/Alerts";
import LogsTable from "../components/LogsTable";
import DateFilter from "../components/DateFilter";
import TrendChart from "../components/TrendChart";
import "../styles/liveStatus.css";
import "../styles/analytics.css";

const API_URL = "http://localhost:3000/api/readings?limit=1000";

function getCalendarDate(timestamp) {
  if (!timestamp) return "";
  const value = String(timestamp);
  if (/^\\d{4}-\\d{2}-\\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function isWithinDateRange(timestamp, startDate, endDate) {
  const date = getCalendarDate(timestamp);
  return !!date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
}
function getParameterStatus(parameter, value) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "NOT EVALUATED";
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
function getOverallStatus(statuses) {
  if (statuses.includes("DANGER")) return "DANGER";
  if (statuses.includes("WARNING")) return "WARNING";
  if (statuses.every(s => s === "SAFE")) return "SAFE";
  return "NOT EVALUATED";
}
function createAlerts(reading, statuses) {
  if (!reading) return [];
  const result = [];
  const recordedAt = reading.recordedAt;
  [
    ["PH", Number(reading.ph), statuses.phStatus, ""],
    ["TEMPERATURE", Number(reading.temperature), statuses.temperatureStatus, "°C"],
    ["TURBIDITY", Number(reading.turbidity), statuses.turbidityStatus, " NTU"],
  ].forEach(([parameter, value, status, unit]) => {
    if (status === "SAFE") return;
    const shown = status === "NOT EVALUATED" ? "--" :
      parameter === "PH" ? value.toFixed(2) : `${value.toFixed(1)}${unit}`;
    result.push({
      id: `${parameter}-${recordedAt}`,
      parameter, value: shown,
      severity: status === "DANGER" ? "danger" : "warning",
      message: status === "NOT EVALUATED" ? "This parameter could not be evaluated. Check the sensor reading." :
        status === "DANGER" ? `${parameter} is outside its configured range.` :
        `${parameter} is approaching a configured limit.`,
      recordedAt,
    });
  });
  return result;
}

function LiveStatus() {
  const [readings, setReadings] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function fetchReadings() {
      try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Could not retrieve readings.");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid backend response.");
        if (!active) return;
        setReadings(data.map(r => ({
          ...r,
          recordedAt: r.recordedAt ?? r.created_at ?? r.recorded_at ?? null,
        })));
        setError("");
      } catch {
        if (active) setError("Unable to connect to the backend. Check that it is running.");
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchReadings();
    const timer = setInterval(fetchReadings, 10000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  // API is newest-first; latest status remains independent of the date filter.
  const latestReading = readings[0] ?? null;
  const latestLogs = useMemo(() => readings.slice(0, 5), [readings]);
  const filteredReadings = useMemo(
    () => readings.filter(r => isWithinDateRange(r.recordedAt, startDate, endDate)),
    [readings, startDate, endDate]
  );
  const phStatus = getParameterStatus("ph", latestReading?.ph);
  const temperatureStatus = getParameterStatus("temperature", latestReading?.temperature);
  const turbidityStatus = getParameterStatus("turbidity", latestReading?.turbidity);
  const overallStatus = getOverallStatus([phStatus, temperatureStatus, turbidityStatus]);
  const currentAlerts = createAlerts(latestReading, { phStatus, temperatureStatus, turbidityStatus });
  const historicalAlerts = useMemo(() => filteredReadings.flatMap(r => {
    const statuses = {
      phStatus: getParameterStatus("ph", r.ph),
      temperatureStatus: getParameterStatus("temperature", r.temperature),
      turbidityStatus: getParameterStatus("turbidity", r.turbidity),
    };
    return createAlerts(r, statuses);
  }), [filteredReadings]);

  return (
    <div className="app">
      <main className="dashboard-main">
        <Header />
        <div className="analytics-header">
          <DateFilter startDate={startDate} endDate={endDate}
            onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
        </div>
        {loading && <p>Loading water-quality readings...</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && readings.length === 0 && <p>No readings have been recorded yet.</p>}

        <StatusBanner status={overallStatus} />
        <section className="status-grid">
          <MetricCard title="PH" value={latestReading?.ph == null ? "--" : Number(latestReading.ph).toFixed(2)} status={phStatus}/>
          <MetricCard title="TEMPERATURE" value={latestReading?.temperature == null ? "--" : Number(latestReading.temperature).toFixed(1)} unit="°C" status={temperatureStatus}/>
          <MetricCard title="TURBIDITY" value={latestReading?.turbidity == null ? "--" : Number(latestReading.turbidity).toFixed(1)} unit="NTU" status={turbidityStatus}/>
        </section>

        <section className="analytics-grid integrated-analytics">
          <TrendChart readings={filteredReadings} parameter="ph" label="PH READINGS TREND"/>
          <TrendChart readings={filteredReadings} parameter="temperature" label="TEMPERATURE READINGS TREND"/>
          <TrendChart readings={filteredReadings} parameter="turbidity" label="TURBIDITY READINGS TREND"/>
          <div className="analytics-logs">
            <div className="panel-header"><h2 className="panel-title">FILTERED LOGS</h2></div>
            <LogsTable readings={filteredReadings}/>
          </div>
          <div className="analytics-alerts">
            <div className="panel-header"><h2 className="panel-title">FILTERED ALERTS</h2></div>
            <Alerts alerts={historicalAlerts}/>
          </div>
        </section>
        <section className="monitoring-panel">
          <div className="panel">
            <div className="panel-header"><h2 className="panel-title">CURRENT ALERTS</h2></div>
            <Alerts alerts={currentAlerts}/>
          </div>
          <div className="panel logs-panel">
            <div className="panel-header"><h2 className="panel-title">LATEST 5 LOGS</h2></div>
            <LogsTable readings={latestLogs}/>
          </div>
        </section>
      </main>
    </div>
  );
}
export default LiveStatus;
