import { useReadContract, useReadContracts } from "wagmi";
import { crowdfundingFactoryAbi, campaignAbi } from "../abis";
import { FACTORY_ADDRESS } from "../config/contracts";
import { CampaignState, type CampaignInfo } from "../types/campaign";

export function useCampaigns() {
  const { data: rawAddresses, isLoading: loadingAddresses } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: crowdfundingFactoryAbi,
    functionName: "getCampaigns",
  });
  const addresses = rawAddresses as readonly `0x${string}`[] | undefined;
  const campaignContracts = (addresses ?? []).map((addr) => ({
    address: addr,
    abi: campaignAbi,
    functionName: "getCampaignInfo" as const,
  }));
  const { data: infos, isLoading: loadingInfos } = useReadContracts({
    contracts: campaignContracts,
    query: { enabled: !!addresses && addresses.length > 0 },
  });
  const campaigns: CampaignInfo[] = (addresses ?? []).map((addr, i) => {
    const result = infos?.[i];
    if (!result || result.status !== "success") {
      return { address: addr, title: "", goalAmount: 0n, totalRaised: 0n, deadline: 0n, state: CampaignState.ACTIVE, milestoneCount: 0n };
    }
    const d = result.result as readonly [string, string, bigint, bigint, bigint, number, bigint];
    return { address: addr, title: d[0], goalAmount: d[2], totalRaised: d[3], deadline: d[4], state: d[5] as CampaignState, milestoneCount: d[6] };
  });
  return { campaigns, isLoading: loadingAddresses || loadingInfos };
}
