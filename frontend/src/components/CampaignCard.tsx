import { Link } from "react-router-dom";
import { formatEther } from "viem";
import type { CampaignInfo } from "../types/campaign";
import { CampaignState } from "../types/campaign";

const STATE_LABELS: Record<number, string> = { [CampaignState.ACTIVE]: "進行中", [CampaignState.SUCCESSFUL]: "達標", [CampaignState.COMPLETED]: "已完成", [CampaignState.FAILED]: "失敗" };
const STATE_COLORS: Record<number, string> = { [CampaignState.ACTIVE]: "#3b82f6", [CampaignState.SUCCESSFUL]: "#16a34a", [CampaignState.COMPLETED]: "#6b7280", [CampaignState.FAILED]: "#dc2626" };

export function CampaignCard({ campaign }: { campaign: CampaignInfo }) {
  const progress = campaign.goalAmount > 0n ? Number((campaign.totalRaised * 100n) / campaign.goalAmount) : 0;
  const deadline = new Date(Number(campaign.deadline) * 1000).toLocaleDateString("zh-TW");
  return (
    <Link to={`/campaign/${campaign.address}`} style={{ textDecoration: "none" }}>
      <div style={{ background: "#fff", borderRadius: "8px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
          <h3 style={{ color: "#111827", margin: 0, fontSize: "1rem" }}>{campaign.title || "(無標題)"}</h3>
          <span style={{ padding: "0.2rem 0.6rem", borderRadius: "9999px", backgroundColor: STATE_COLORS[campaign.state] + "20", color: STATE_COLORS[campaign.state], fontSize: "0.75rem", fontWeight: 600 }}>
            {STATE_LABELS[campaign.state]}
          </span>
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.25rem" }}>
            <span>{formatEther(campaign.totalRaised)} ETH 已籌</span>
            <span>目標 {formatEther(campaign.goalAmount)} ETH</span>
          </div>
          <div style={{ background: "#e5e7eb", borderRadius: "9999px", height: "6px" }}>
            <div style={{ background: "#3b82f6", width: `${Math.min(progress, 100)}%`, height: "100%", borderRadius: "9999px" }} />
          </div>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>{progress}%</div>
        </div>
        <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>截止：{deadline}</div>
      </div>
    </Link>
  );
}
