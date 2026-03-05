import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { campaignAbi } from "../abis";

export function useVote(campaignAddress: `0x${string}`) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  function vote(milestoneIndex: number, support: boolean) {
    writeContract({ address: campaignAddress, abi: campaignAbi, functionName: "voteOnMilestone", args: [BigInt(milestoneIndex), support] });
  }
  return { vote, isPending, isConfirming, isSuccess, error };
}
