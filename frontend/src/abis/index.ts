import type { Abi } from "viem";
import CrowdfundingFactoryABI from "./CrowdfundingFactory.json";
import CampaignABI from "./Campaign.json";
export const crowdfundingFactoryAbi = CrowdfundingFactoryABI.abi as Abi;
export const campaignAbi = CampaignABI.abi as Abi;
