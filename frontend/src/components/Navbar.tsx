import React, { useContext } from "react";
import { Link, useLocation } from "react-router-dom";
import { WalletContext } from "../App";

export default function Navbar() {
  const wallet = useContext(WalletContext)!;
  const location = useLocation();

  const navLinks = [
    { to: "/", label: "探索" },
    { to: "/create", label: "發起募資" },
    { to: "/my-account", label: "我的帳號" },
  ];

  const shortAddr = wallet.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : null;

  return (
    <nav className="sticky top-0 z-50 bg-dark-800/80 backdrop-blur-md border-b border-dark-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-accent flex items-center justify-center text-white font-bold text-sm">
              CC
            </div>
            <span className="font-display font-bold text-xl text-white">CrowdChain</span>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? "bg-brand/20 text-brand"
                    : "text-slate-300 hover:text-white hover:bg-dark-600"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Wallet */}
          <div className="flex items-center gap-3">
            {wallet.isWrongNetwork && (
              <button
                onClick={wallet.switchToSepolia}
                className="text-xs text-red-400 font-medium hidden sm:block hover:text-red-300 border border-red-400/30 rounded-lg px-3 py-1.5 hover:bg-red-400/10 transition-colors"
              >
                ⚠ 請切換到 Sepolia
              </button>
            )}
            {wallet.address ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 bg-dark-600 border border-dark-500 rounded-xl px-3 py-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow" />
                  <span className="text-slate-200 text-sm font-medium">{shortAddr}</span>
                </div>
                <button onClick={wallet.disconnect} className="btn-secondary text-sm py-2 px-3">
                  斷開
                </button>
              </div>
            ) : (
              <button
                onClick={wallet.connect}
                disabled={wallet.isConnecting}
                className="btn-primary text-sm"
              >
                {wallet.isConnecting ? "連接中..." : "連接錢包"}
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
