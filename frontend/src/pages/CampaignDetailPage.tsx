import { useParams } from "react-router-dom";
import { formatEther } from "viem";
import { useCampaignDetail } from "../hooks/useCampaignDetail";
import { ContributeForm } from "../components/ContributeForm";
import { MilestoneCard } from "../components/MilestoneCard";
import { RefundButton } from "../components/RefundButton";
import { CampaignState, MilestoneState } from "../types/campaign";

const STATE_LABELS: Record<number, string> = { [CampaignState.ACTIVE]: "進行中", [CampaignState.SUCCESSFUL]: "達標 ✓", [CampaignState.COMPLETED]: "已完成", [CampaignState.FAILED]: "失敗" };
const STATE_COLORS: Record<number, string> = { [CampaignState.ACTIVE]: "#3b82f6", [CampaignState.SUCCESSFUL]: "#16a34a", [CampaignState.COMPLETED]: "#6b7280", [CampaignState.FAILED]: "#dc2626" };

export function CampaignDetailPage() {
  const { address } = useParams<{ address: string }>();
  const { campaignInfo, milestones, hasVoted, creatorAddress, isLoading } = useCampaignDetail(address as `0x${string}` | undefined);

  if (isLoading) return <p style={{ color: "#111827" }}>載入中...</p>;
  if (!campaignInfo) return <p style={{ color: "#111827" }}>找不到活動</p>;

  const progress = campaignInfo.goalAmount > 0n ? Number((campaignInfo.totalRaised * 100n) / campaignInfo.goalAmount) : 0;
  const deadline = new Date(Number(campaignInfo.deadline) * 1000).toLocaleString("zh-TW");

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
        <h1 style={{ color: "#111827" }}>{campaignInfo.title}</h1>
        <span style={{ padding: "0.25rem 0.75rem", borderRadius: "9999px", backgroundColor: STATE_COLORS[campaignInfo.state] + "20", color: STATE_COLORS[campaignInfo.state], fontSize: "0.875rem", fontWeight: 600 }}>
          {STATE_LABELS[campaignInfo.state]}
        </span>
      </div>

      {creatorAddress && (
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
          發起人：{creatorAddress.slice(0, 6)}...{creatorAddress.slice(-4)}
        </p>
      )}

      <div style={{ background: "#fff", borderRadius: "8px", padding: "1.5rem", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ color: "#111827" }}>已籌：<strong>{formatEther(campaignInfo.totalRaised)} ETH</strong></span>
            <span style={{ color: "#111827" }}>目標：<strong>{formatEther(campaignInfo.goalAmount)} ETH</strong></span>
          </div>
          <div style={{ background: "#e5e7eb", borderRadius: "9999px", height: "8px" }}>
            <div style={{ background: progress >= 100 ? "#16a34a" : "#3b82f6", width: `${Math.min(progress, 100)}%`, height: "100%", borderRadius: "9999px" }} />
          </div>
          <p style={{ color: "#111827", marginTop: "0.25rem", fontSize: "0.875rem" }}>
            進度：{progress}% | 截止：{deadline}
          </p>
        </div>

        {campaignInfo.state === CampaignState.ACTIVE && <ContributeForm campaignAddress={campaignInfo.address} />}

        {campaignInfo.state === CampaignState.FAILED && (
          <div style={{ padding: "1rem", backgroundColor: "#fef2f2", borderRadius: "8px", border: "1px solid #fca5a5" }}>
            <p style={{ color: "#dc2626", fontWeight: 600, margin: "0 0 0.25rem" }}>❌ 募款失敗</p>
            <p style={{ color: "#6b7280", margin: 0, fontSize: "0.875rem" }}>未達到目標金額，支持者可以申請退款。</p>
          </div>
        )}

        {campaignInfo.state === CampaignState.SUCCESSFUL && (
          <div style={{ padding: "1rem", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px solid #86efac" }}>
            <p style={{ color: "#16a34a", fontWeight: 600, margin: 0 }}>🎉 募款成功！發起人可以開始申請里程碑資金。</p>
          </div>
        )}

        <RefundButton campaignAddress={campaignInfo.address} />
      </div>

      {milestones.length > 0 && (
        <div>
          <h2 style={{ color: "#111827" }}>里程碑（{milestones.length} 個）</h2>
          {milestones.map((m, i) => (
            <MilestoneCard
              key={i}
              index={i}
              milestone={m}
              campaignAddress={campaignInfo.address}
              totalRaised={campaignInfo.totalRaised}
              hasVoted={hasVoted[i] ?? false}
              campaignState={campaignInfo.state}
              creatorAddress={creatorAddress ?? ""}
              prevMilestoneApproved={i === 0 || milestones[i - 1]?.state === MilestoneState.APPROVED}
            />
          ))}
        </div>
      )}
    </div>
  );
}
