/**
 * @file BottomNav.jsx
 * @description Fixed bottom navigation shown on every page, plus the light/dark
 * theme toggle. Theme state lives here (not in a context) because this is the
 * only component that reads or writes it — the rest of the app reacts purely
 * through CSS variables.
 */
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

/**
 * Renders the four navigation tabs and the theme toggle button.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <BottomNav />
 */
function BottomNav() {
const { pathname } = useLocation();
// Lazy initializer so localStorage is read once, not on every render.
// Anything except the stored value "light" (including first visit) means dark —
// dark is the shop-floor default.
const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem("theme") === "light";
});
// Custom matcher instead of NavLink's isActive: the Runs tab must light up for
// /runs AND /runs/:id (detail), but NOT for /runs/new — that's the New Run
// tab's territory. The negative lookahead (?!new$) carves out exactly that.
const isRunsActive = pathname === "/runs" || /^\/runs\/(?!new$)[^/]+$/.test(pathname);

useEffect(() => {
    // The data-theme attribute is what index.css keys its light-palette
    // overrides on — flipping it restyles the whole app without any React
    // re-render beyond this component.
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
    // 60px is mirrored by App.jsx's paddingBottom — keep them in sync.
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
