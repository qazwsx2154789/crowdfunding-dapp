import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { useCreateCampaign } from "../hooks/useCreateCampaign";

interface MilestoneInput { description: string; fundingBPS: number; }

const labelStyle = { display: "block", marginBottom: "0.25rem", color: "#111827", fontWeight: 500 };
const inputStyle = { width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "4px", color: "#111827", fontSize: "1rem" };

export function CreateCampaignPage() {
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { createCampaign, isPending, isConfirming, isSuccess, error } = useCreateCampaign();
  const [title, setTitle] = useState("");
  const [ipfsHash, setIpfsHash] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [milestones, setMilestones] = useState<MilestoneInput[]>([{ description: "", fundingBPS: 10000 }]);

  const totalBPS = milestones.reduce((s, m) => s + m.fundingBPS, 0);

  function addMilestone() {
    setMilestones([...milestones, { description: "", fundingBPS: 0 }]);
  }
  function removeMilestone(i: number) {
    setMilestones(milestones.filter((_, idx) => idx !== i));
  }
  function updateMilestone(i: number, field: keyof MilestoneInput, value: string | number) {
    const updated = [...milestones];
    updated[i] = { ...updated[i], [field]: value };
    setMilestones(updated);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (totalBPS !== 10000) { alert("所有里程碑的資金比例加總必須等於 100%"); return; }
    const deadlineTs = Math.floor(new Date(deadlineDate).getTime() / 1000);
    createCampaign(title, ipfsHash, goalAmount, deadlineTs, milestones);
  }

  if (isSuccess) {
    setTimeout(() => navigate("/"), 2000);
    return <div style={{ textAlign: "center", padding: "3rem" }}><h2 style={{ color: "#16a34a" }}>活動建立成功！</h2><p style={{ color: "#6b7280" }}>正在返回首頁...</p></div>;
  }

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ color: "#111827" }}>建立眾籌活動</h1>
      {!isConnected && <div style={{ padding: "1rem", backgroundColor: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "8px", marginBottom: "1rem", color: "#92400e" }}>請先連接錢包才能建立活動</div>}
      <form onSubmit={handleSubmit} style={{ backgroundColor: "#fff", padding: "1.5rem", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>活動標題 *</label>
          <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} required placeholder="我的眾籌活動" />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>IPFS Hash（說明文件）</label>
          <input style={inputStyle} value={ipfsHash} onChange={e => setIpfsHash(e.target.value)} placeholder="QmXxx..." />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>目標金額 (ETH) *</label>
          <input style={inputStyle} type="number" step="0.01" min="0.01" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} required placeholder="10" />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>截止日期 *</label>
          <input style={inputStyle} type="datetime-local" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)} required />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ color: "#111827", margin: 0 }}>里程碑</h3>
            <span style={{ fontSize: "0.875rem", color: totalBPS === 10000 ? "#16a34a" : "#dc2626" }}>總比例：{totalBPS / 100}% {totalBPS !== 10000 ? "（需等於 100%）" : "✓"}</span>
          </div>
          {milestones.map((m, i) => (
            <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: "6px", padding: "1rem", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ color: "#111827", fontWeight: 500 }}>里程碑 #{i + 1}</span>
                {milestones.length > 1 && <button type="button" onClick={() => removeMilestone(i)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "0.875rem" }}>移除</button>}
              </div>
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={labelStyle}>描述 *</label>
                <input style={inputStyle} value={m.description} onChange={e => updateMilestone(i, "description", e.target.value)} required placeholder="Phase 1: 完成設計" />
              </div>
              <div>
                <label style={labelStyle}>資金比例 (%) *</label>
                <input style={inputStyle} type="number" min="1" max="100" value={m.fundingBPS / 100}
                  onChange={e => updateMilestone(i, "fundingBPS", Math.round(Number(e.target.value) * 100))}
                  required placeholder="30" />
              </div>
            </div>
          ))}
          <button type="button" onClick={addMilestone} style={{ width: "100%", padding: "0.5rem", border: "2px dashed #d1d5db", borderRadius: "6px", backgroundColor: "transparent", color: "#6b7280", cursor: "pointer" }}>
            + 新增里程碑
          </button>
        </div>

        <button type="submit" disabled={!isConnected || isPending || isConfirming}
          style={{ width: "100%", padding: "0.75rem", backgroundColor: isConnected ? "#3b82f6" : "#9ca3af", color: "#fff", border: "none", borderRadius: "6px", fontSize: "1rem", fontWeight: 600, cursor: isConnected ? "pointer" : "not-allowed" }}>
          {isPending ? "確認中..." : isConfirming ? "處理中..." : "建立活動"}
        </button>
        {error && <p style={{ color: "#dc2626", marginTop: "0.5rem" }}>錯誤：{error.message.slice(0, 100)}</p>}
      </form>
    </div>
  );
}
