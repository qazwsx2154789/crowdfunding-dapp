import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { campaignAbi } from "../abis";

export function useRequestMilestoneRelease(campaignAddress: `0x${string}`) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  function requestRelease(milestoneIndex: number) {
    writeContract({ address: campaignAddress, abi: campaignAbi, functionName: "requestMilestoneRelease", args: [BigInt(milestoneIndex)] });
  }
  return { requestRelease, isPending, isConfirming, isSuccess, error };
}
