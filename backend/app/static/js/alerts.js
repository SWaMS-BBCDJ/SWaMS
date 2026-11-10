const ALERTS_PER_PAGE = 5;
const alertsState = {
  period: "7days",
  from: "",
  to: "",
  records: [],
  total: 0,
  showingAll: false,
  requestId: 0
};

const alertThresholds = (() => {
  const dataElement = document.getElementById("swams-dashboard-data");
  if (!dataElement) return {};

  try {
    return JSON.parse(dataElement.textContent).thresholds || {};
  } catch (error) {
    console.error("Unable to read alert thresholds:", error);
    return {};
  }
})();

function alertDate(value) {
  if (typeof value !== "string" || !value) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setAlertMessage(message, isError = false) {
  const body = document.getElementById("alerts-table-body");
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 5;
  cell.className = isError ? "empty-alerts alert-load-error" : "empty-alerts";
  cell.textContent = message;

  if (isError) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "alert-retry-button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => loadAlerts());
    cell.append(" ", retry);
  }

  row.append(cell);
  body.replaceChildren(row);
}

function setAlertLoading(isLoading) {
  const button = document.getElementById("show-more-alerts");
  if (!button) return;

  button.disabled = isLoading;
  if (isLoading) button.textContent = "Loading alerts...";
}

async function requestAlertPage(page, perPage, requestId) {
  const params = new URLSearchParams({
    period: alertsState.period,
    page: String(page),
    per_page: String(perPage)
  });

  if (alertsState.period === "custom") {
    params.set("from", alertsState.from);
    params.set("to", alertsState.to);
  }

  const response = await fetch(`/api/alerts?${params}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Unable to retrieve alert history.");
  }
  if (requestId !== alertsState.requestId) return null;
  return payload;
}

async function loadAlerts() {
  const requestId = ++alertsState.requestId;
  alertsState.showingAll = false;
  alertsState.records = [];
  alertsState.total = 0;
  setAlertLoading(true);
  setAlertMessage("Loading alerts...");

  const count = document.getElementById("alert-count");
  const showingCount = document.getElementById("alert-showing-count");
  count.textContent = "Loading...";
  showingCount.textContent = "Loading alerts...";

  try {
    const payload = await requestAlertPage(1, ALERTS_PER_PAGE, requestId);
    if (!payload) return;

    alertsState.records = payload.alerts;
    alertsState.total = payload.total;
    renderAlerts();
  } catch (error) {
    if (requestId !== alertsState.requestId) return;
    console.error("Error loading alert history:", error);
    count.textContent = "Alerts unavailable";
    showingCount.textContent = "Could not load alert history.";
    setAlertMessage(error.message || "Unable to load alert history.", true);
    document.getElementById("show-more-alerts").hidden = true;
  } finally {
    if (requestId === alertsState.requestId) {
      setAlertLoading(false);
      updateMoreButton();
    }
  }
}

function renderAlerts() {
  const body = document.getElementById("alerts-table-body");
  const count = document.getElementById("alert-count");
  const showingCount = document.getElementById("alert-showing-count");

  count.textContent = `${alertsState.total} ${alertsState.total === 1 ? "alert" : "alerts"}`;
  if (!alertsState.records.length) {
    setAlertMessage("No alerts found for this date range.");
    showingCount.textContent = "Showing 0 alerts";
    updateMoreButton();
    return;
  }

  const fragment = document.createDocumentFragment();
  alertsState.records.forEach(alert => {
    fragment.append(createAlertRow(alert));
  });
  body.replaceChildren(fragment);

  showingCount.textContent = `Showing ${alertsState.records.length} of ${alertsState.total} alerts`;
  updateMoreButton();
}

function createAlertRow(alert) {
  const parameter = String(alert.parameter || "unknown").toLowerCase();
  const normalizedParameter = ["ph", "temperature", "turbidity"].includes(parameter)
    ? parameter
    : "unknown";
  const label = {
    ph: "pH",
    temperature: "Temperature",
    turbidity: "Turbidity",
    unknown: alert.parameter || "Unknown"
  }[normalizedParameter];
  const threshold = alertThresholds[normalizedParameter];
  const value = alert.value == null ? null : Number(alert.value);
  const direction = value !== null && threshold &&
      threshold.safe_min != null && threshold.safe_max != null
    ? value < Number(threshold.safe_min)
      ? "Below safe range"
      : value > Number(threshold.safe_max)
        ? "Above safe range"
        : "Threshold alert"
    : "Threshold alert";
  const unit = normalizedParameter === "temperature"
    ? "°C"
    : normalizedParameter === "turbidity"
      ? "NTU"
      : "";

  const row = document.createElement("tr");
  row.className = "alert-row";

  const dateCell = document.createElement("td");
  dateCell.dataset.label = "Date & time";
  const date = alertDate(alert.sent_at);
  const dateText = document.createElement("span");
  dateText.className = "alert-date";
  dateText.textContent = date
    ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    : "Time unavailable";
  const timeText = document.createElement("span");
  timeText.className = "alert-time";
  timeText.textContent = date
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  dateCell.append(dateText, timeText);

  const parameterCell = document.createElement("td");
  parameterCell.dataset.label = "Parameter";
  const parameterTag = document.createElement("span");
  parameterTag.className = `parameter-tag tag-${normalizedParameter}`;
  parameterTag.textContent = label;
  parameterCell.append(parameterTag);

  const valueCell = document.createElement("td");
  valueCell.dataset.label = "Measured value";
  const valueText = document.createElement("span");
  valueText.className = "alert-value";
  valueText.textContent = value === null || !Number.isFinite(value)
    ? "—"
    : normalizedParameter === "ph"
      ? value.toFixed(2)
      : value.toFixed(1);
  valueCell.append(valueText);
  if (unit) {
    const unitText = document.createElement("span");
    unitText.className = "alert-unit";
    unitText.textContent = unit;
    valueCell.append(unitText);
  }

  const detailsCell = document.createElement("td");
  detailsCell.dataset.label = "Alert details";
  const status = document.createElement("span");
  status.className = "alert-status";
  const directionText = document.createElement("strong");
  directionText.className = "alert-direction";
  directionText.textContent = direction;
  status.append(directionText);

  if (threshold && threshold.safe_min != null && threshold.safe_max != null) {
    const safeRange = document.createElement("span");
    safeRange.textContent = `Safe ${Number(threshold.safe_min).toFixed(1)}–${Number(threshold.safe_max).toFixed(1)}${unit ? ` ${unit}` : ""}`;
    status.append(safeRange);
  }
  detailsCell.append(status);

  const expandCell = document.createElement("td");
  expandCell.className = "alert-expand-cell";
  expandCell.dataset.label = "Details";
  const detailRow = document.createElement("tr");
  detailRow.className = "alert-detail-row";
  detailRow.id = `alert-detail-${alert.id}`;
  detailRow.hidden = true;
  const expandButton = document.createElement("button");
  expandButton.type = "button";
  expandButton.className = "alert-expand-button";
  expandButton.setAttribute("aria-expanded", "false");
  expandButton.setAttribute("aria-controls", detailRow.id);
  expandButton.setAttribute("aria-label", `Show details for ${label} alert`);
  expandButton.innerHTML = '<span aria-hidden="true">›</span>';
  expandCell.append(expandButton);

  const detailCell = document.createElement("td");
  detailCell.colSpan = 5;
  const detailPanel = document.createElement("div");
  detailPanel.className = "alert-detail-panel";
  const detailHeading = document.createElement("strong");
  detailHeading.textContent = `${label} alert`;
  const message = document.createElement("p");
  message.textContent = alert.message || `${direction}.`;
  detailPanel.append(detailHeading, message);
  detailCell.append(detailPanel);
  detailRow.append(detailCell);

  expandButton.addEventListener("click", () => {
    const expanded = expandButton.getAttribute("aria-expanded") === "true";
    expandButton.setAttribute("aria-expanded", String(!expanded));
    expandButton.setAttribute(
      "aria-label",
      `${expanded ? "Show" : "Hide"} details for ${label} alert`
    );
    detailRow.hidden = expanded;
  });

  row.append(dateCell, parameterCell, valueCell, detailsCell, expandCell);
  const group = document.createDocumentFragment();
  group.append(row, detailRow);
  return group;
}

function updateMoreButton() {
  const button = document.getElementById("show-more-alerts");
  const hasMore = alertsState.records.length < alertsState.total;
  button.hidden = !hasMore;
  if (hasMore && !button.disabled) {
    button.textContent = alertsState.showingAll
      ? "Loading alerts..."
      : "View all alerts";
  }
}

async function showAllAlerts() {
  if (alertsState.records.length >= alertsState.total) return;

  const requestId = ++alertsState.requestId;
  alertsState.showingAll = true;
  setAlertLoading(true);
  const button = document.getElementById("show-more-alerts");
  button.textContent = "Loading alerts...";

  try {
    const payload = await requestAlertPage(1, 100, requestId);
    if (!payload) return;

    const records = [...payload.alerts];
    for (let page = 2; page <= payload.total_pages; page += 1) {
      const nextPage = await requestAlertPage(page, 100, requestId);
      if (!nextPage) return;
      records.push(...nextPage.alerts);
    }

    if (requestId !== alertsState.requestId) return;
    alertsState.records = records;
    renderAlerts();
  } catch (error) {
    if (requestId !== alertsState.requestId) return;
    console.error("Error loading all alerts:", error);
    document.getElementById("alert-showing-count").textContent =
      "Could not load all alerts.";
    button.textContent = "Retry loading alerts";
  } finally {
    if (requestId === alertsState.requestId) {
      alertsState.showingAll = false;
      setAlertLoading(false);
      updateMoreButton();
    }
  }
}

function setActiveAlertRange(range) {
  document.querySelectorAll(".alert-range-button").forEach(button => {
    const selected = button.dataset.range === range;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

const today = new Date();
const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(today.getDate() - 6);
document.getElementById("alert-date-from").value = localDateInputValue(sevenDaysAgo);
document.getElementById("alert-date-to").value = localDateInputValue(today);

document.querySelectorAll(".alert-range-button").forEach(button => {
  button.addEventListener("click", () => {
    const range = button.dataset.range;
    setActiveAlertRange(range);

    if (range === "custom") {
      document.getElementById("alert-custom-dates").hidden = false;
      document.getElementById("alert-date-from").focus();
      return;
    }

    document.getElementById("alert-custom-dates").hidden = true;
    alertsState.period = range === "today"
      ? "today"
      : range === "7"
        ? "7days"
        : "28days";
    loadAlerts();
  });
});

document.getElementById("apply-alert-dates").addEventListener("click", () => {
  const fromInput = document.getElementById("alert-date-from");
  const toInput = document.getElementById("alert-date-to");

  if (!fromInput.value || !toInput.value) {
    toInput.setCustomValidity("Choose both a start and end date.");
    toInput.reportValidity();
    return;
  }
  toInput.setCustomValidity("");

  if (fromInput.value > toInput.value) {
    toInput.setCustomValidity("The end date must be on or after the start date.");
    toInput.reportValidity();
    return;
  }

  alertsState.period = "custom";
  alertsState.from = fromInput.value;
  alertsState.to = toInput.value;
  loadAlerts();
});

document.getElementById("alert-date-to").addEventListener("input", event => {
  event.currentTarget.setCustomValidity("");
});
document.getElementById("alert-date-from").addEventListener("input", event => {
  event.currentTarget.setCustomValidity("");
});
document.getElementById("show-more-alerts").addEventListener("click", showAllAlerts);

loadAlerts();
