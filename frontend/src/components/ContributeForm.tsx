import { useState, type FormEvent } from "react";
import { useContribute } from "../hooks/useContribute";
import { useAccount } from "wagmi";

export function ContributeForm({ campaignAddress }: { campaignAddress: `0x${string}` }) {
  const [amount, setAmount] = useState("");
  const { isConnected } = useAccount();
  const { contribute, isPending, isConfirming, isSuccess, error } = useContribute(campaignAddress);
  if (!isConnected) return <p style={{ color: "#6b7280", marginTop: "1rem" }}>請先連接錢包才能贊助</p>;
  function handleSubmit(e: FormEvent) { e.preventDefault(); if (amount) contribute(amount); }
  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
      <h3 style={{ color: "#111827" }}>贊助此活動</h3>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input type="number" step="0.001" min="0" placeholder="金額 (ETH)" value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "4px", color: "#111827" }} />
        <button type="submit" disabled={isPending || isConfirming || !amount}
          style={{ padding: "0.5rem 1rem", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "4px" }}>
          {isPending ? "確認中..." : isConfirming ? "處理中..." : "贊助"}
        </button>
      </div>
      {isSuccess && <p style={{ color: "#16a34a", marginTop: "0.5rem" }}>贊助成功！</p>}
      {error && <p style={{ color: "#dc2626", marginTop: "0.5rem" }}>錯誤：{error.message.slice(0, 100)}</p>}
    </form>
  );
}
