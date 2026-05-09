import { NavLink } from "react-router-dom";

function BottomNav() {
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
        style={({ isActive }) =>
        isActive ? { ...styles.link, ...styles.activeLink } : styles.link
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
    backgroundColor: "#1a1a2e",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    borderTop: "1px solid #333",
    zIndex: 1000,
},
link: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textDecoration: "none",
    color: "#888",
    fontSize: "10px",
    gap: "2px",
    padding: "8px 16px",
},
activeLink: {
    color: "#4f8ef7",
},
icon: {
    fontSize: "20px",
},
label: {
    fontSize: "10px",
},
};

export default BottomNav;
