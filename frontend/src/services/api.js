
/* =========================================================
   API SERVICE
   Connects React frontend to Flask backend.
   Handles authentication for protected API requests.
   ========================================================= */

const API_BASE_URL = "http://localhost:5000";

/* =========================================================
   AUTHENTICATION HELPERS
   ========================================================= */

function getAuthToken() {
  return localStorage.getItem("token");
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

function redirectToLogin() {
  logout();

  // Avoid repeatedly redirecting if already on the login page.
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

/* =========================================================
   RESPONSE HANDLER
   ========================================================= */

async function handleResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      `Request failed with status ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   AUTHENTICATED API REQUEST
   All protected dashboard requests use this helper.
   ========================================================= */

async function authenticatedRequest(
  endpoint,
  options = {},
  { notFoundAsNull = false } = {}
) {
  const token = getAuthToken();

  if (!token) {
    redirectToLogin();
    throw new Error("Please log in to continue.");
  }

  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  // The backend rejected or expired the session.
  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Your session has expired. Please log in again.");
  }

  // No live sensor reading is available.
  if (notFoundAsNull && response.status === 404) {
    return null;
  }

  return handleResponse(response);
}

/* =========================================================
   1. HISTORICAL SENSOR READINGS
   GET /api/readings/history
   ========================================================= */

export async function getReadingHistory() {
  return authenticatedRequest("/api/readings/history");
}

/* =========================================================
   2. SENSOR THRESHOLDS
   GET /api/settings/thresholds
   ========================================================= */

export async function getThresholds() {
  return authenticatedRequest("/api/settings/thresholds");
}

/* =========================================================
   3. USER LOGIN
   POST /api/auth/login

   Login is public, so it does not use authenticatedRequest.
   ========================================================= */

export async function login(username, password) {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    }
  );

  const data = await handleResponse(response);

  if (data.token) {
    localStorage.setItem("token", data.token);
  }

  if (data.user) {
    localStorage.setItem("user", JSON.stringify(data.user));
  }

  return data;
}

/* =========================================================
   4. LATEST LIVE SENSOR READING
   GET /api/readings/latest
   ========================================================= */

export async function getLatestReading() {
  return authenticatedRequest(
    "/api/readings/latest",
    {},
    { notFoundAsNull: true }
  );
}

/* =========================================================
   5. ALERT INCIDENTS
   GET /api/alerts
   ========================================================= */

export async function getAlerts({
  startDate = "",
  endDate = "",
} = {}) {
  const params = new URLSearchParams();

  if (startDate && endDate) {
    params.set("period", "custom");
    params.set("from", startDate);
    params.set("to", endDate);
  } else {
    params.set("period", "7days");
  }

  return authenticatedRequest(
    `/api/alerts?${params.toString()}`
  );
}
