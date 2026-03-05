export const CampaignState = { ACTIVE: 0, SUCCESSFUL: 1, COMPLETED: 2, FAILED: 3 } as const;
export type CampaignState = (typeof CampaignState)[keyof typeof CampaignState];
export const MilestoneState = { PENDING: 0, VOTING: 1, APPROVED: 2, REJECTED: 3 } as const;
export type MilestoneState = (typeof MilestoneState)[keyof typeof MilestoneState];
export interface CampaignInfo {
  address: `0x${string}`;
  title: string;
  goalAmount: bigint;
  totalRaised: bigint;
  deadline: bigint;
  state: CampaignState;
  milestoneCount: bigint;
}
export interface Milestone {
  description: string;
  fundingBPS: bigint;
  votingDeadline: bigint;
  state: MilestoneState;
  yesVotes: bigint;
  noVotes: bigint;
  fundsReleased: boolean;
}
