import { Routes, Route, Navigate } from "react-router-dom";
import LiveStatus from "./pages/LiveStatus";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LiveStatus />} />
      <Route path="/dashboard" element={<LiveStatus />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;