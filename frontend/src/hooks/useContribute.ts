import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { campaignAbi } from "../abis";

export function useContribute(campaignAddress: `0x${string}`) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  function contribute(amountEth: string) {
    writeContract({ address: campaignAddress, abi: campaignAbi, functionName: "contribute", value: parseEther(amountEth) });
  }
  return { contribute, isPending, isConfirming, isSuccess, error };
}
