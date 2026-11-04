
import { NavLink } from "react-router-dom";

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/_Logo.png" alt="WQM Logo" />
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          LIVE STATUS
        </NavLink>

        <NavLink
          to="/analytics"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          ANALYTICS
        </NavLink>
      </nav>
    </aside>
  );
}

export default Sidebar;
