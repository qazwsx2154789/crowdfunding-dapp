import { formatEther } from "viem";
import { useClaimRefund } from "../hooks/useClaimRefund";
import { useAccount } from "wagmi";

export function RefundButton({ campaignAddress }: { campaignAddress: `0x${string}` }) {
  const { isConnected } = useAccount();
  const { claimRefund, pendingRefund, isPending, isConfirming, isSuccess, error } = useClaimRefund(campaignAddress);
  if (!isConnected || !pendingRefund || pendingRefund === 0n) return null;
  return (
    <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fef2f2", borderRadius: "8px", border: "1px solid #fca5a5" }}>
      <p style={{ color: "#dc2626", margin: "0 0 0.5rem" }}>可退款：<strong>{formatEther(pendingRefund)} ETH</strong></p>
      <button onClick={claimRefund} disabled={isPending || isConfirming}
        style={{ padding: "0.5rem 1rem", backgroundColor: "#dc2626", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>
        {isPending ? "確認中..." : isConfirming ? "處理中..." : "申請退款"}
      </button>
      {isSuccess && <p style={{ color: "#16a34a", marginTop: "0.5rem" }}>退款成功！</p>}
      {error && <p style={{ color: "#dc2626", marginTop: "0.5rem" }}>錯誤：{error.message.slice(0, 100)}</p>}
    </div>
  );
}
