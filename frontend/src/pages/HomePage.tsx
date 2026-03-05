import { Link } from "react-router-dom";
import { useCampaigns } from "../hooks/useCampaigns";
import { CampaignCard } from "../components/CampaignCard";

export function HomePage() {
  const { campaigns, isLoading } = useCampaigns();
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ color: "#111827" }}>眾籌活動</h1>
        <Link to="/create" style={{ padding: "0.5rem 1rem", backgroundColor: "#3b82f6", color: "#fff", borderRadius: "6px", fontWeight: 600 }}>建立活動</Link>
      </div>
      {isLoading && <p style={{ color: "#111827" }}>載入中...</p>}
      {!isLoading && campaigns.length === 0 && <p style={{ color: "#6b7280" }}>目前沒有活動，來建立第一個吧！</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
        {campaigns.map((c) => <CampaignCard key={c.address} campaign={c} />)}
      </div>
    </div>
  );
}
