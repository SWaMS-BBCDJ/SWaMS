
const API_BASE_URL = "http://localhost:5000";

// Check backend connection
export const checkBackend = async () => {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) throw new Error("Backend connection failed");
  return response.json();
};

// Get latest readings
export const getLatestReadings = async () => {
  const response = await fetch(`${API_BASE_URL}/api/readings/latest`);
  if (!response.ok) throw new Error("Failed to fetch latest readings");
  return response.json();
};

// Get historical readings
export const getReadingHistory = async () => {
  const response = await fetch(`${API_BASE_URL}/api/readings/history`);
  if (!response.ok) throw new Error("Failed to fetch reading history");
  return response.json();
};

// Get alerts
export const getAlerts = async (params = {}) => {
  const query = new URLSearchParams(params);
  const response = await fetch(`${API_BASE_URL}/api/alerts?${query}`);
  if (!response.ok) throw new Error("Failed to fetch alerts");
  return response.json();
};
