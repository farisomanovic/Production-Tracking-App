import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

function BottomNav() {
const { pathname } = useLocation();
const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem("theme") === "light";
});
const isRunsActive = pathname === "/runs" || /^\/runs\/(?!new$)[^/]+$/.test(pathname);

useEffect(() => {
    document.documentElement.dataset.theme = isLightMode ? "light" : "dark";
    localStorage.setItem("theme", isLightMode ? "light" : "dark");
}, [isLightMode]);

return (
    <nav style={styles.nav}>
    <NavLink
        to="/"
        style={({ isActive }) =>
        isActive ? { ...styles.link, ...styles.activeLink } : styles.link
        }
        end
    >
        <span style={styles.icon}>🏠</span>
        <span style={styles.label}>Dashboard</span>
    </NavLink>

    <NavLink
        to="/runs"
        style={() =>
        isRunsActive ? { ...styles.link, ...styles.activeLink } : styles.link
        }
    >
        <span style={styles.icon}>📋</span>
        <span style={styles.label}>Runs</span>
    </NavLink>

    <NavLink
        to="/runs/new"
        style={({ isActive }) =>
        isActive ? { ...styles.link, ...styles.activeLink } : styles.link
        }
    >
        <span style={styles.icon}>➕</span>
        <span style={styles.label}>New Run</span>
    </NavLink>

    <NavLink
        to="/admin"
        style={({ isActive }) =>
        isActive ? { ...styles.link, ...styles.activeLink } : styles.link
        }
    >
        <span style={styles.icon}>⚙️</span>
        <span style={styles.label}>Admin</span>
    </NavLink>

    <button
        type="button"
        onClick={() => setIsLightMode(prev => !prev)}
        style={styles.themeButton}
        aria-label={isLightMode ? "Switch to dark background" : "Switch to light background"}
    >
        <span style={styles.icon}>{isLightMode ? "☾" : "☀"}</span>
        <span style={styles.label}>{isLightMode ? "Dark" : "Light"}</span>
    </button>
    </nav>
);
}

const styles = {
nav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60px",
    backgroundColor: "var(--color-surface)",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    borderTop: "1px solid var(--color-border)",
    zIndex: 1000,
},
link: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textDecoration: "none",
    color: "var(--color-text-secondary)",
    fontSize: "10px",
    gap: "2px",
    padding: "8px 16px",
},
activeLink: {
    color: "var(--color-accent-link)",
},
icon: {
    fontSize: "20px",
},
label: {
    fontSize: "10px",
},
themeButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textDecoration: "none",
    color: "var(--color-text-secondary)",
    fontSize: "10px",
    gap: "2px",
    padding: "8px 16px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
},
};

export default BottomNav;



