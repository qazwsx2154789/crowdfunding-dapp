import { formatEther } from "viem";
import type { Milestone } from "../types/campaign";
import { MilestoneState, CampaignState } from "../types/campaign";
import { useVote } from "../hooks/useVote";
import { useRequestMilestoneRelease } from "../hooks/useRequestMilestoneRelease";
import { useFinalizeVote } from "../hooks/useFinalizeVote";
import { useAccount } from "wagmi";

const STATE_LABELS: Record<number, string> = {
  [MilestoneState.PENDING]: "待定",
  [MilestoneState.VOTING]: "投票中",
  [MilestoneState.APPROVED]: "已批准",
  [MilestoneState.REJECTED]: "已否決",
};
const STATE_COLORS: Record<number, string> = {
  [MilestoneState.PENDING]: "#6b7280",
  [MilestoneState.VOTING]: "#f59e0b",
  [MilestoneState.APPROVED]: "#16a34a",
  [MilestoneState.REJECTED]: "#dc2626",
};

interface Props {
  index: number;
  milestone: Milestone;
  campaignAddress: `0x${string}`;
  totalRaised: bigint;
  hasVoted: boolean;
  campaignState: number;
  creatorAddress: string;
  prevMilestoneApproved: boolean;
}

export function MilestoneCard({ index, milestone, campaignAddress, totalRaised, hasVoted, campaignState, creatorAddress, prevMilestoneApproved }: Props) {
  const { address: currentUser } = useAccount();
  const { vote, isPending: vPending, isConfirming: vConfirming, isSuccess: vSuccess, error: vError } = useVote(campaignAddress);
  const { requestRelease, isPending: rPending, isConfirming: rConfirming, isSuccess: rSuccess, error: rError } = useRequestMilestoneRelease(campaignAddress);
  const { finalizeVote, isPending: fPending, isConfirming: fConfirming, isSuccess: fSuccess, error: fError } = useFinalizeVote(campaignAddress);

  const isCreator = currentUser?.toLowerCase() === creatorAddress?.toLowerCase();
  const fundingPercent = Number(milestone.fundingBPS) / 100;
  const fundingAmount = totalRaised > 0n ? (totalRaised * milestone.fundingBPS) / 10000n : 0n;
  const totalVotes = milestone.yesVotes + milestone.noVotes;
  const yesPercent = totalVotes > 0n ? Number((milestone.yesVotes * 100n) / totalVotes) : 0;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const votingEnded = milestone.votingDeadline > 0n && now >= milestone.votingDeadline;
  const canStartVoting = campaignState === CampaignState.SUCCESSFUL
    && milestone.state === MilestoneState.PENDING
    && isCreator
    && (index === 0 || prevMilestoneApproved);

  async function advanceTime() {
    await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "evm_increaseTime", params: [604801], id: 1 }) });
    await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 2 }) });
    window.location.reload();
  }

  return (
    <div style={{ background: "#fff", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", border: milestone.state === MilestoneState.VOTING ? "2px solid #f59e0b" : "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h4 style={{ color: "#111827", margin: 0 }}>#{index + 1} {milestone.description}</h4>
        <span style={{ padding: "0.2rem 0.6rem", borderRadius: "9999px", backgroundColor: STATE_COLORS[milestone.state] + "20", color: STATE_COLORS[milestone.state], fontSize: "0.75rem", fontWeight: 600 }}>
          {STATE_LABELS[milestone.state]}
        </span>
      </div>

      <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
        資金比例：{fundingPercent}%（{formatEther(fundingAmount)} ETH）
      </p>

      {/* 發起人啟動投票 */}
      {canStartVoting && (
        <div style={{ marginTop: "0.5rem" }}>
          <button onClick={() => requestRelease(index)} disabled={rPending || rConfirming}
            style={{ padding: "0.5rem 1.25rem", backgroundColor: "#7c3aed", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
            {rPending ? "確認中..." : rConfirming ? "處理中..." : "🗳️ 啟動此里程碑投票"}
          </button>
          {rSuccess && <p style={{ color: "#16a34a", fontSize: "0.875rem", marginTop: "0.25rem" }}>投票已開始！</p>}
          {rError && <p style={{ color: "#dc2626", fontSize: "0.875rem", marginTop: "0.25rem" }}>錯誤：{rError.message.slice(0, 80)}</p>}
        </div>
      )}

      {/* 投票中 */}
      {milestone.state === MilestoneState.VOTING && (
        <div style={{ marginTop: "0.75rem" }}>
          {milestone.votingDeadline > 0n && (
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              投票截止：{new Date(Number(milestone.votingDeadline) * 1000).toLocaleString("zh-TW")}
              {votingEnded ? " ✓ 已截止" : ""}
            </p>
          )}

          {/* 投票結果進度條 */}
          <div style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.25rem" }}>
              <span style={{ color: "#16a34a" }}>贊成 {String(milestone.yesVotes)} wei</span>
              <span style={{ color: "#dc2626" }}>反對 {String(milestone.noVotes)} wei</span>
            </div>
            <div style={{ background: "#e5e7eb", borderRadius: "9999px", height: "8px" }}>
              <div style={{ background: "#16a34a", width: `${yesPercent}%`, height: "100%", borderRadius: "9999px", transition: "width 0.3s" }} />
            </div>
            <p style={{ color: "#6b7280", fontSize: "0.75rem", marginTop: "0.25rem" }}>
              贊成 {yesPercent}% / 反對 {100 - yesPercent}%
            </p>
          </div>

          {/* 投票按鈕 */}
          {!votingEnded && !hasVoted && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={() => vote(index, true)} disabled={vPending || vConfirming}
                style={{ padding: "0.5rem 1.25rem", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "1rem" }}>
                👍 贊成
              </button>
              <button onClick={() => vote(index, false)} disabled={vPending || vConfirming}
                style={{ padding: "0.5rem 1.25rem", backgroundColor: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "1rem" }}>
                👎 反對
              </button>
            </div>
          )}
          {hasVoted && !votingEnded && <p style={{ color: "#6b7280" }}>✅ 你已投票</p>}
          {vSuccess && <p style={{ color: "#16a34a", marginTop: "0.5rem" }}>投票成功！</p>}
          {vError && <p style={{ color: "#dc2626", marginTop: "0.5rem", fontSize: "0.875rem" }}>錯誤：{vError.message.slice(0, 80)}</p>}

          {/* 開發工具：快轉時間 + 結算 */}
          <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: "#f3f4f6", borderRadius: "6px", border: "1px dashed #9ca3af" }}>
            <p style={{ color: "#6b7280", fontSize: "0.75rem", margin: "0 0 0.5rem" }}>🛠️ 開發工具</p>
            {!votingEnded && (
              <button onClick={advanceTime}
                style={{ padding: "0.4rem 0.8rem", backgroundColor: "#f59e0b", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.875rem", marginRight: "0.5rem" }}>
                ⏩ 快轉 7 天（讓投票截止）
              </button>
            )}
            {votingEnded && (
              <button onClick={() => finalizeVote(index)} disabled={fPending || fConfirming}
                style={{ padding: "0.4rem 0.8rem", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.875rem" }}>
                {fPending ? "確認中..." : fConfirming ? "處理中..." : "✅ 結算投票 / 發放資金"}
              </button>
            )}
            {fSuccess && <p style={{ color: "#16a34a", fontSize: "0.875rem", marginTop: "0.25rem" }}>結算成功！資金已發放！</p>}
            {fError && <p style={{ color: "#dc2626", fontSize: "0.875rem", marginTop: "0.25rem" }}>錯誤：{fError.message.slice(0, 80)}</p>}
          </div>
        </div>
      )}

      {milestone.fundsReleased && (
        <p style={{ color: "#16a34a", fontSize: "0.875rem", marginTop: "0.5rem" }}>✓ 資金已釋出</p>
      )}
    </div>
  );
}
