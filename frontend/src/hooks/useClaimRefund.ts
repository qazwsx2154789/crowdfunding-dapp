import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from "wagmi";
import { campaignAbi } from "../abis";

export function useClaimRefund(campaignAddress: `0x${string}`) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { data: pendingRefund } = useReadContract({
    address: campaignAddress, abi: campaignAbi, functionName: "pendingRefunds",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });
  function claimRefund() {
    writeContract({ address: campaignAddress, abi: campaignAbi, functionName: "claimRefund" });
  }
  return { claimRefund, pendingRefund: pendingRefund as bigint | undefined, isPending, isConfirming, isSuccess, error };
}
