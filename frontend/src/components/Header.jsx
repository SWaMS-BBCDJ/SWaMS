
import { useEffect, useState } from "react";

function Header() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const today = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const currentTime = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return (
    <header className="header">
      <div className="header-brand">
        <img
          src="/_Logo.png"
          alt="SWaMS Logo"
          className="header-logo"
        />

        <div>
          <h1 className="header-title">SWaMS</h1>
          <p className="header-subtitle">
            Claveria, Misamis Oriental
          </p>
        </div>
      </div>

      <div className="header-date">
        <p>{today} | {currentTime}</p>
      </div>
    </header>
  );
}

export default Header;
