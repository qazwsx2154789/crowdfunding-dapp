import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { campaignAbi } from "../abis";

export function useFinalizeVote(campaignAddress: `0x${string}`) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  function finalizeVote(milestoneIndex: number) {
    writeContract({ address: campaignAddress, abi: campaignAbi, functionName: "finalizeVote", args: [BigInt(milestoneIndex)] });
  }
  return { finalizeVote, isPending, isConfirming, isSuccess, error };
}
