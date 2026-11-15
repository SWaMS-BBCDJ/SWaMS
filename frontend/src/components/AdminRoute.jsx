
import { Navigate } from "react-router-dom";
import { isAuthenticated, getCurrentUser } from "../services/auth";

function AdminRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const user = getCurrentUser();

  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default AdminRoute;
