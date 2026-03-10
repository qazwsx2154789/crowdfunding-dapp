import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import CreateCampaign from "./pages/CreateCampaign";
import CampaignDetail from "./pages/CampaignDetail";
import MyAccount from "./pages/MyAccount";
import { useWallet } from "./hooks/useWallet";

export const WalletContext = React.createContext<ReturnType<typeof useWallet> | null>(null);

export default function App() {
  const wallet = useWallet();

  return (
    <WalletContext.Provider value={wallet}>
      <BrowserRouter>
        <div className="min-h-screen bg-dark-900">
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<CreateCampaign />} />
              <Route path="/campaign/:address" element={<CampaignDetail />} />
              <Route path="/my-account" element={<MyAccount />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </WalletContext.Provider>
  );
}
