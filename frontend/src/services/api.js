
/* =========================================================
   API SERVICE
   Connects React frontend to Flask backend.
   ========================================================= */

// CHANGED: Centralized Flask backend URL.
// Change this only if your Flask server uses another port.
const API_BASE_URL = "http://localhost:5000";


/* =========================================================
   HELPER: GET AUTHENTICATION TOKEN
   ========================================================= */

// Retrieve the token saved during login.
function getAuthToken() {

  return localStorage.getItem("token");

}


/* =========================================================
   HELPER: HANDLE API RESPONSES
   ========================================================= */

// CHANGED: Centralized response and error handling.
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
   1. GET HISTORICAL SENSOR READINGS
   ========================================================= */

// Flask endpoint:
// GET /api/readings/history

export async function getReadingHistory() {

  const response = await fetch(
    `${API_BASE_URL}/api/readings/history`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return await handleResponse(response);

}


/* =========================================================
   2. GET SENSOR THRESHOLDS
   ========================================================= */

// Flask endpoint:
// GET /api/settings/thresholds
//
// CHANGED:
// Sends the Bearer authentication token.
// Your Flask endpoint uses @token_required.

export async function getThresholds() {

  const token = getAuthToken();

  if (!token) {

    throw new Error(
      "Authentication token not found. Please log in again."
    );

  }

  const response = await fetch(
    `${API_BASE_URL}/api/settings/thresholds`,
    {
      method: "GET",

      headers: {
        "Content-Type": "application/json",

        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response);

}


/* =========================================================
   3. USER LOGIN
   ========================================================= */

// Flask endpoint:
// POST /api/auth/login
//
// Saves the returned token for authenticated requests.

export async function login(username, password) {

  const response = await fetch(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        username,
        password,
      }),
    }
  );

  const data = await handleResponse(response);

  // Save authentication token.
  if (data.token) {

    localStorage.setItem("token", data.token);

  }

  // Save user information.
  if (data.user) {

    localStorage.setItem(
      "user",
      JSON.stringify(data.user)
    );

  }

  return data;

}


/* =========================================================
   4. LOGOUT
   ========================================================= */

// Remove authentication information.

export function logout() {

  localStorage.removeItem("token");

  localStorage.removeItem("user");

}


/* =========================================================
   GET LATEST LIVE SENSOR READING
   ========================================================= */

// Flask endpoint:
// GET /api/readings/latest
//
// Returns the most recent reading from the LiveReading table.
// Returns null if the backend has no live reading yet.

export async function getLatestReading() {

  const response = await fetch(
    `${API_BASE_URL}/api/readings/latest`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  // HTTP 404 means the sensor has not sent any data yet.
  if (response.status === 404) {
    return null;
  }

  return await handleResponse(response);
}
