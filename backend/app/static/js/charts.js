
let trendChart = null;
let historyRows = [];
let selectedRangeDays = 28;
// Seed data is sampled every four hours; allow two hours of delivery delay.
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

function parseReadingTimestamp(timestamp) {
  if (typeof timestamp !== "string" || !timestamp) return null;

  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp);
  const date = new Date(hasTimezone ? timestamp : `${timestamp}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ==========================================
// READ DATA EMBEDDED BY FLASK
// ==========================================
function getDashboardData() {
  const element = document.getElementById("swams-dashboard-data");

  if (!element) {
    return {
      latest: null,
      thresholds: {}
    };
  }

  try {
    const data = JSON.parse(element.textContent);

    return {
      latest: data.latest || null,
      thresholds: data.thresholds || {}
    };
  } catch (error) {
    console.error("Unable to parse dashboard data:", error);

    return {
      latest: null,
      thresholds: {}
    };
  }
}

// ==========================================
// LOAD SENSOR CARDS + POND OVERVIEW
// ==========================================
async function loadCards() {
  const timeEl = document.getElementById("last-reading");
  const updatedEl = document.getElementById("updated-at");

  try {
    const res = await fetch("/api/readings/latest", {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error("Unable to retrieve latest readings.");
    }

    const d = await res.json();

    if (!d || (!d.timestamp && d.ph == null && d.temperature == null && d.turbidity == null)) {
      setCardValues("--", "--", "--");
      setMetricStatuses(null);
      setPondStatus("NO DATA", "status-unknown");
      setConnectionStatus("No sensor data", "is-offline");
      setFreshness(null);

      if (timeEl) timeEl.textContent = "No readings yet";
      if (updatedEl) updatedEl.textContent = "No data available";
      return;
    }

    const ph = d.ph == null || d.ph === "" ? NaN : Number(d.ph);
    const temperature = d.temperature == null || d.temperature === ""
      ? NaN
      : Number(d.temperature);
    const turbidity = d.turbidity == null || d.turbidity === ""
      ? NaN
      : Number(d.turbidity);

    setCardValues(
      Number.isFinite(ph) ? ph.toFixed(2) : "--",
      Number.isFinite(temperature) ? `${temperature.toFixed(1)} °C` : "--",
      Number.isFinite(turbidity) ? `${turbidity.toFixed(1)} NTU` : "--"
    );

    // Update last-reading timestamp
    if (timeEl) {
      const timestamp = parseReadingTimestamp(d.timestamp);
      timeEl.textContent = timestamp
        ? timestamp.toLocaleString()
        : "Timestamp unavailable";
    }
    if (updatedEl) {
      const timestamp = parseReadingTimestamp(d.timestamp);
      updatedEl.textContent = timestamp
        ? `Reading from ${timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Timestamp unavailable";
    }

    // Update overall status using thresholds embedded by Flask
    const isFresh = setFreshness(d.timestamp);
    updatePondStatus(d, isFresh);
    setMetricStatuses(d);
    setConnectionStatus("Latest data loaded", "is-online");

  } catch (error) {
    console.error("Error loading latest readings:", error);

    setPondStatus("CONNECTION ERROR", "status-unknown");
    setMetricStatuses(null);
    setConnectionStatus("Data service unavailable", "is-offline");
    setFreshness(null);

    if (timeEl) {
      timeEl.textContent = "Unable to retrieve latest reading";
    }
    if (updatedEl) {
      updatedEl.textContent = "Update failed";
    }
  }
}

function setFreshness(timestamp) {
  const badge = document.getElementById("device-freshness");
  const label = document.getElementById("freshness-label");
  const readingDate = parseReadingTimestamp(timestamp);
  const ageMs = readingDate ? Date.now() - readingDate.getTime() : NaN;
  const validAge = Number.isFinite(ageMs) && ageMs >= 0;
  const isFresh = validAge && ageMs <= STALE_AFTER_MS;

  if (badge && label) {
    badge.className = "freshness-badge";
    if (!validAge) {
      badge.classList.add("is-unknown");
      label.textContent = "Age unavailable";
    } else if (isFresh) {
      badge.classList.add("is-fresh");
      label.textContent = `Fresh · ${formatAge(ageMs)} ago`;
    } else {
      badge.classList.add("is-stale");
      label.textContent = `Stale · ${formatAge(ageMs)} ago`;
    }
  }

  return isFresh;
}

function formatAge(ageMs) {
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function setConnectionStatus(label, className) {
  const statusEl = document.getElementById("connection-status");
  const labelEl = document.getElementById("connection-label");
  if (!statusEl) return;

  statusEl.className = "connection-status " + className;
  if (labelEl) labelEl.textContent = label;
}

function setMetricStatuses(reading) {
  const { thresholds } = getDashboardData();
  const metrics = [
    ["ph", "state-ph", "card-ph"],
    ["temperature", "state-temp", "card-temp"],
    ["turbidity", "state-turb", "card-turb"]
  ];

  for (const [parameter, elementId, cardId] of metrics) {
    const element = document.getElementById(elementId);
    if (!element) continue;
    const card = document.getElementById(cardId);

    const rawValue = reading ? reading[parameter] : null;
    const value = rawValue == null || rawValue === ""
      ? NaN
      : Number(rawValue);
    const threshold = thresholds[parameter];
    const safeMin = threshold && threshold.safe_min != null
      ? Number(threshold.safe_min)
      : NaN;
    const safeMax = threshold && threshold.safe_max != null
      ? Number(threshold.safe_max)
      : NaN;

    element.className = "metric-state";
    if (card) card.classList.remove("alert");
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(safeMin) ||
      !Number.isFinite(safeMax)
    ) {
      element.textContent = "Unavailable";
      element.classList.add("state-unknown");
    } else if (value < safeMin) {
      element.textContent = "Below range";
      element.classList.add("state-alert");
      if (card) card.classList.add("alert");
    } else if (value > safeMax) {
      element.textContent = "Above range";
      element.classList.add("state-alert");
      if (card) card.classList.add("alert");
    } else {
      element.textContent = "In range";
      element.classList.add("state-normal");
    }
  }
}

// ==========================================
// UPDATE OVERALL POND STATUS
// ==========================================
function updatePondStatus(reading, isFresh) {
  const { thresholds } = getDashboardData();

  const parameters = [
    ["ph", reading.ph],
    ["temperature", reading.temperature],
    ["turbidity", reading.turbidity]
  ];

  let warning = false;
  let unknown = false;

  for (const [parameter, rawValue] of parameters) {
    const threshold = thresholds[parameter];

    const value = Number(rawValue);

    if (
      rawValue === null ||
      rawValue === undefined ||
      rawValue === "" ||
      !Number.isFinite(value) ||
      !threshold ||
      threshold.safe_min === null ||
      threshold.safe_min === undefined ||
      threshold.safe_max === null ||
      threshold.safe_max === undefined
    ) {
      unknown = true;
      continue;
    }

    const safeMin = Number(threshold.safe_min);
    const safeMax = Number(threshold.safe_max);

    if (
      !Number.isFinite(safeMin) ||
      !Number.isFinite(safeMax)
    ) {
      unknown = true;
      continue;
    }

    if (value < safeMin || value > safeMax) {
      warning = true;
    }
  }

  // A confirmed threshold breach takes priority over missing thresholds.
  if (warning) {
    setPondStatus("WARNING", "status-warning");
  } else if (unknown) {
    setPondStatus("STATUS UNKNOWN", "status-unknown");
  } else if (!isFresh) {
    setPondStatus("DATA STALE", "status-unknown");
  } else {
    setPondStatus("NORMAL", "status-normal");
  }
}

// ==========================================
// STATUS DISPLAY HELPER
// ==========================================
function setPondStatus(label, className) {
  const statusEl = document.getElementById("pond-status");

  if (!statusEl) return;

  statusEl.textContent = label;
  statusEl.className = "pond-status " + className;
}

// ==========================================
// SENSOR CARD HELPER
// ==========================================
function setCardValues(ph, temperature, turbidity) {
  const phEl = document.getElementById("val-ph");
  const tempEl = document.getElementById("val-temp");
  const turbEl = document.getElementById("val-turb");

  if (phEl) phEl.textContent = ph;
  if (tempEl) tempEl.textContent = temperature;
  if (turbEl) turbEl.textContent = turbidity;
}

// ==========================================
// LOAD FOUR-WEEK TREND CHART
// ==========================================
async function loadTrend() {
  try {
    const res = await fetch("/api/readings/history", {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error("Unable to retrieve reading history.");
    }

    historyRows = await res.json();
    renderTrend(document.getElementById("trend-parameter")?.value || "ph");
  } catch (error) {
    console.error("Error loading trend chart:", error);
  }
}

function renderTrend(parameter) {
  const canvas = document.getElementById("trendChart");
  if (!canvas) return;

  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }

  const configuration = {
    ph: {
      label: "pH level",
      unit: "pH",
      color: "#167d8d",
      threshold: "ph"
    },
    temperature: {
      label: "Temperature",
      unit: "°C",
      color: "#d97706",
      threshold: "temperature"
    },
    turbidity: {
      label: "Turbidity",
      unit: "NTU",
      color: "#2563eb",
      threshold: "turbidity"
    }
  }[parameter] || {
    label: "pH level",
    unit: "pH",
    color: "#167d8d",
    threshold: "ph"
  };
  const { thresholds } = getDashboardData();
  const threshold = thresholds[configuration.threshold] || {};
  const cutoff = Date.now() - selectedRangeDays * 24 * 60 * 60 * 1000;
  const rows = historyRows.filter(row => {
    const date = parseReadingTimestamp(row.t);
    return date && date.getTime() >= cutoff && date.getTime() <= Date.now();
  });
  const labels = rows.map(row => {
    const date = parseReadingTimestamp(row.t);
    return date
      ? date.toLocaleDateString([], {
        month: "short",
        day: "numeric"
      })
      : "";
  });
  const safeMin = threshold.safe_min != null && Number.isFinite(Number(threshold.safe_min))
    ? Number(threshold.safe_min)
    : null;
  const safeMax = threshold.safe_max != null && Number.isFinite(Number(threshold.safe_max))
    ? Number(threshold.safe_max)
    : null;
  const datasets = [
    {
      label: configuration.label,
      data: rows.map(row => row[parameter]),
      borderColor: configuration.color,
      backgroundColor: configuration.color + "18",
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2,
      spanGaps: true
    }
  ];

  if (safeMin !== null) {
    datasets.push({
      label: "Safe minimum",
      data: rows.map(() => safeMin),
      borderColor: "#58a37a",
      borderDash: [6, 5],
      pointRadius: 0,
      borderWidth: 1.5,
      tension: 0
    });
  }
  if (safeMax !== null) {
    datasets.push({
      label: "Safe maximum",
      data: rows.map(() => safeMax),
      borderColor: "#58a37a",
      borderDash: [6, 5],
      pointRadius: 0,
      borderWidth: 1.5,
      tension: 0
    });
  }

  trendChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index"
      },
      scales: {
        x: {
          ticks: {
            color: "#64748b",
            maxTicksLimit: 7,
            maxRotation: 0
          },
          grid: {
            color: "rgba(148, 163, 184, 0.18)"
          }
        },
        y: {
          title: {
            display: true,
            text: configuration.unit,
            color: "#64748b"
          },
          suggestedMin: safeMin !== null
            ? safeMin
            : undefined,
          suggestedMax: safeMax !== null
            ? safeMax
            : undefined,
          ticks: {
            color: "#64748b"
          },
          grid: {
            color: "rgba(148, 163, 184, 0.18)"
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: "#536a77",
            usePointStyle: true,
            boxWidth: 7,
            boxHeight: 7,
            padding: 12,
            font: {
              size: 10
            }
          }
        },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            title: items => {
              const timestamp = rows[items[0]?.dataIndex]?.t;
              const date = parseReadingTimestamp(timestamp);
              return date
                ? date.toLocaleString()
                : "";
            },
            label: context => {
              const label = context.dataset.label;
              return `${label}: ${context.parsed.y} ${configuration.unit}`;
            }
          }
        }
      }
    }
  });
}

// ==========================================
// INITIAL LOAD + PERIODIC SENSOR REFRESH
// ==========================================
async function refreshDashboard() {
  await Promise.all([
    loadCards(),
    loadTrend()
  ]);
}

refreshDashboard();

document.getElementById("refresh-dashboard")?.addEventListener("click", refreshDashboard);
document.getElementById("trend-parameter")?.addEventListener("change", event => {
  renderTrend(event.target.value);
});
document.querySelectorAll(".range-button").forEach(button => {
  button.addEventListener("click", () => {
    selectedRangeDays = Number(button.dataset.days);
    document.querySelectorAll(".range-button").forEach(option => {
      const selected = option === button;
      option.classList.toggle("is-active", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    renderTrend(document.getElementById("trend-parameter")?.value || "ph");
  });
});

// Refresh sensor values and chart every 60 seconds
setInterval(refreshDashboard, 60000);
