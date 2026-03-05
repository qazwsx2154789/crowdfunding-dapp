import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { crowdfundingFactoryAbi } from "../abis";
import { FACTORY_ADDRESS } from "../config/contracts";

interface MilestoneInput { description: string; fundingBPS: number; }

export function useCreateCampaign() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  function createCampaign(title: string, ipfsHash: string, goalAmount: string, deadline: number, milestones: MilestoneInput[]) {
    writeContract({
      address: FACTORY_ADDRESS, abi: crowdfundingFactoryAbi, functionName: "createCampaign",
      args: [title, ipfsHash, parseEther(goalAmount), BigInt(deadline), milestones.map(m=>m.description), milestones.map(m=>BigInt(m.fundingBPS))],
    });
  }
  return { createCampaign, isPending, isConfirming, isSuccess, error };
}
