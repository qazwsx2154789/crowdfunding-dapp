import { useReadContract, useReadContracts, useAccount } from "wagmi";
import { campaignAbi } from "../abis";
import { CampaignState, MilestoneState, type CampaignInfo, type Milestone } from "../types/campaign";

export function useCampaignDetail(address: `0x${string}` | undefined) {
  const { address: userAddress } = useAccount();

  const { data: infoRaw, isLoading: loadingInfo } = useReadContract({
    address, abi: campaignAbi, functionName: "getCampaignInfo",
    query: { enabled: !!address },
  });

  const { data: creatorAddress } = useReadContract({
    address, abi: campaignAbi, functionName: "creator",
    query: { enabled: !!address },
  });

  const milestoneCount = infoRaw ? Number((infoRaw as readonly unknown[])[6]) : 0;

  const milestoneContracts = Array.from({ length: milestoneCount }, (_v, i) => ({
    address: address!, abi: campaignAbi, functionName: "getMilestone" as const, args: [i] as const,
  }));

  const { data: milestonesRaw, isLoading: loadingMilestones } = useReadContracts({
    contracts: milestoneContracts,
    query: { enabled: !!address && milestoneCount > 0 },
  });

  const zeroAddr = "0x0000000000000000000000000000000000000000" as const;
  const hasVotedContracts = Array.from({ length: milestoneCount }, (_v, i) => ({
    address: address!, abi: campaignAbi, functionName: "hasVoted" as const,
    args: [i, userAddress ?? zeroAddr] as const,
  }));

  const { data: hasVotedRaw } = useReadContracts({
    contracts: hasVotedContracts,
    query: { enabled: !!address && !!userAddress && milestoneCount > 0 },
  });

  const campaignInfo: CampaignInfo | undefined = infoRaw
    ? (() => {
        const d = infoRaw as readonly [string, string, bigint, bigint, bigint, number, bigint];
        return { address: address!, title: d[0], goalAmount: d[2], totalRaised: d[3], deadline: d[4], state: d[5] as CampaignState, milestoneCount: d[6] };
      })()
    : undefined;

  const milestones: Milestone[] = (milestonesRaw ?? []).map((r) => {
    if (!r || r.status !== "success") return { description: "", fundingBPS: 0n, votingDeadline: 0n, state: MilestoneState.PENDING, yesVotes: 0n, noVotes: 0n, fundsReleased: false };
    const m = r.result as { description: string; fundingBPS: bigint; votingDeadline: bigint; state: number; yesVotes: bigint; noVotes: bigint; fundsReleased: boolean };
    return { description: m.description, fundingBPS: m.fundingBPS, votingDeadline: m.votingDeadline, state: m.state as MilestoneState, yesVotes: m.yesVotes, noVotes: m.noVotes, fundsReleased: m.fundsReleased };
  });

  const hasVoted: boolean[] = (hasVotedRaw ?? []).map((r) => r?.status === "success" && (r.result as boolean));

  return { campaignInfo, milestones, hasVoted, creatorAddress: creatorAddress as string | undefined, isLoading: loadingInfo || loadingMilestones };
}
