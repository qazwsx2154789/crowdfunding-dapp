export const FACTORY_ABI = [
  "event CampaignCreated(address indexed campaignAddress, address indexed creator, string title, uint256 goalAmount, uint256 deadline)",
  "function createCampaign(string calldata _title, string calldata _ipfsHash, uint256 _goalAmount, uint256 _deadline, uint256 _votingDuration, string[] calldata _milestoneDescriptions, uint256[] calldata _milestoneFundingBPS) external returns (address campaignAddress)",
  "function getCampaigns() external view returns (address[] memory)",
  "function getCampaignCount() external view returns (uint256)",
  "function getCampaignsByCreator(address creator) external view returns (address[] memory)",
  "function getBackerNFTAddress() external view returns (address)",
  "function getCrowdTokenAddress() external view returns (address)",
  "function getPlatformFee() external view returns (uint256)",
  "function isCampaign(address) external view returns (bool)",
];

export const CAMPAIGN_ABI = [
  "event ContributionMade(address indexed backer, uint256 amount, uint256 tokensMinted)",
  "event MilestoneReleaseRequested(uint256 indexed milestoneIndex, uint256 votingDeadline)",
  "event VoteCast(uint256 indexed milestoneIndex, address indexed voter, bool support, uint256 weight)",
  "event MilestoneFinalized(uint256 indexed milestoneIndex, uint8 result, uint256 fundsReleased)",
  "event RefundClaimed(address indexed backer, uint256 amount)",
  "event CampaignFinalized(uint8 newState)",
  "function getCampaignInfo() external view returns (string memory _title, string memory _ipfsHash, uint256 _goalAmount, uint256 _totalRaised, uint256 _deadline, uint8 _state, uint256 _milestoneCount, uint256 _votingDuration)",
  "function getMilestoneCount() external view returns (uint256)",
  "function getMilestone(uint256 index) external view returns (tuple(string description, uint256 fundingBPS, uint256 votingDeadline, uint8 state, uint256 yesVotes, uint256 noVotes, bool fundsReleased))",
  "function getBackers() external view returns (address[] memory)",
  "function contributions(address) external view returns (uint256 amount, bool refunded)",
  "function hasVoted(uint256, address) external view returns (bool)",
  "function pendingRefunds(address) external view returns (uint256)",
  "function creator() external view returns (address)",
  "function votingDuration() external view returns (uint256)",
  "function state() external view returns (uint8)",
  "function totalRaised() external view returns (uint256)",
  "function goalAmount() external view returns (uint256)",
  "function deadline() external view returns (uint256)",
  "function contribute() external payable",
  "function finalizeCampaign() external",
  "function requestMilestoneRelease(uint256 milestoneIndex) external",
  "function voteOnMilestone(uint256 milestoneIndex, bool support) external",
  "function finalizeVote(uint256 milestoneIndex) external",
  "function claimRefund() external",
];

export const BACKER_NFT_ABI = [
  "event NFTMinted(uint256 indexed tokenId, address indexed to, address indexed campaign, uint8 tier)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string memory)",
  "function getNFTData(uint256 tokenId) external view returns (tuple(address campaign, uint8 tier, uint256 contributionAmount, uint256 mintedAt))",
  "function totalSupply() external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
];

export const CROWD_TOKEN_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function symbol() external view returns (string memory)",
  "function decimals() external view returns (uint8)",
  "function name() external view returns (string memory)",
  "function totalSupply() external view returns (uint256)",
];

// Chainlink ETH/USD Price Feed on Sepolia
export const CHAINLINK_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
];

// Sepolia ETH/USD feed address
export const CHAINLINK_ETH_USD_SEPOLIA = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
