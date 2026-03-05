import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8f9fa" }}>
      <header style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e7eb", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to="/" style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827", textDecoration: "none" }}>CrowdFund</Link>
        <ConnectButton />
      </header>
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>{children}</main>
    </div>
  );
}
