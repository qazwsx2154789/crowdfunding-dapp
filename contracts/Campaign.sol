// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BackerNFT.sol";
import "./CrowdToken.sol";

/// @title Campaign - Core crowdfunding logic per campaign instance
/// @notice Deployed by CrowdfundingFactory for each new campaign
contract Campaign is ReentrancyGuard {
    // ─────────────────────────────────────────────
    // Enums & Structs
    // ─────────────────────────────────────────────

    enum CampaignState {
        ACTIVE,
        SUCCESSFUL,
        COMPLETED,
        FAILED
    }

    enum MilestoneState {
        PENDING,
        VOTING,
        APPROVED,
        REJECTED
    }

    struct Milestone {
        string description;
        uint256 fundingBPS;      // Basis points of total funds (sum must = 10000)
        uint256 votingDeadline;  // Unix timestamp when voting ends
        MilestoneState state;
        uint256 yesVotes;        // Weighted yes votes (in wei)
        uint256 noVotes;         // Weighted no votes (in wei)
        bool fundsReleased;
    }

    struct NFTTier {
        uint256 minContribution; // Minimum ETH (in wei) for this tier
        uint8 tier;              // 0=Bronze, 1=Silver, 2=Gold
    }

    struct Contribution {
        uint256 amount;
        bool refunded;
        uint8 nftTier;
    }

    // ─────────────────────────────────────────────
    // State variables
    // ─────────────────────────────────────────────

    address public immutable factory;
    address public immutable creator;
    BackerNFT public immutable backerNFT;
    CrowdToken public immutable crowdToken;

    string public title;
    string public ipfsHash;       // IPFS CID for campaign details
    uint256 public goalAmount;    // Target fundraising amount (in wei)
    uint256 public deadline;      // Unix timestamp for fundraising end
    uint256 public platformFeeBPS; // Platform fee in basis points (e.g., 250 = 2.5%)

    uint256 public totalRaised;
    uint256 public totalReleasedBPS; // How many BPS have been approved & released so far

    CampaignState public state;
    Milestone[] public milestones;
    NFTTier[] public nftTiers;    // Sorted descending by minContribution

    mapping(address => Contribution) public contributions;
    address[] public backers;

    /// @dev Per-milestone per-address vote tracking
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    /// @dev Refund amounts claimable from rejected milestones (per backer)
    mapping(address => uint256) public pendingRefunds;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event ContributionMade(address indexed backer, uint256 amount, uint8 nftTier, uint256 tokensMinted);
    event MilestoneReleaseRequested(uint256 indexed milestoneIndex, uint256 votingDeadline);
    event VoteCast(uint256 indexed milestoneIndex, address indexed voter, bool support, uint256 weight);
    event MilestoneFinalized(uint256 indexed milestoneIndex, MilestoneState result, uint256 fundsReleased);
    event FundsWithdrawn(address indexed creator, uint256 amount);
    event RefundClaimed(address indexed backer, uint256 amount);
    event CampaignFinalized(CampaignState newState);

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    modifier onlyCreator() {
        require(msg.sender == creator, "Campaign: caller is not creator");
        _;
    }

    modifier onlyBacker() {
        require(contributions[msg.sender].amount > 0, "Campaign: caller is not a backer");
        _;
    }

    modifier onlyActive() {
        require(state == CampaignState.ACTIVE, "Campaign: not active");
        _;
    }

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /// @param _creator Campaign creator address
    /// @param _backerNFT BackerNFT contract address
    /// @param _crowdToken CrowdToken contract address
    /// @param _title Campaign title
    /// @param _ipfsHash IPFS hash for campaign description
    /// @param _goalAmount Funding goal in wei
    /// @param _deadline Unix timestamp deadline
    /// @param _platformFeeBPS Platform fee in basis points
    /// @param _milestoneDescriptions Array of milestone descriptions
    /// @param _milestoneFundingBPS Array of milestone funding percentages in BPS
    /// @param _nftTierThresholds Array of NFT tier min contribution thresholds (wei), descending
    /// @param _nftTierValues Array of NFT tier values (0=Bronze,1=Silver,2=Gold)
    constructor(
        address _creator,
        address _backerNFT,
        address _crowdToken,
        string memory _title,
        string memory _ipfsHash,
        uint256 _goalAmount,
        uint256 _deadline,
        uint256 _platformFeeBPS,
        string[] memory _milestoneDescriptions,
        uint256[] memory _milestoneFundingBPS,
        uint256[] memory _nftTierThresholds,
        uint8[] memory _nftTierValues
    ) {
        require(_creator != address(0), "Campaign: zero creator");
        require(_backerNFT != address(0), "Campaign: zero NFT address");
        require(_crowdToken != address(0), "Campaign: zero token address");
        require(_goalAmount > 0, "Campaign: goal must be positive");
        require(_deadline > block.timestamp, "Campaign: deadline in the past");
        require(
            _milestoneDescriptions.length == _milestoneFundingBPS.length,
            "Campaign: milestone arrays length mismatch"
        );
        require(_milestoneDescriptions.length > 0, "Campaign: no milestones");
        require(
            _nftTierThresholds.length == _nftTierValues.length,
            "Campaign: NFT tier arrays length mismatch"
        );

        // Validate milestone BPS sums to 10000
        uint256 totalBPS;
        for (uint256 i = 0; i < _milestoneFundingBPS.length; i++) {
            require(_milestoneFundingBPS[i] > 0, "Campaign: milestone BPS must be positive");
            totalBPS += _milestoneFundingBPS[i];
        }
        require(totalBPS == 10000, "Campaign: milestone BPS must sum to 10000");

        factory = msg.sender;
        creator = _creator;
        backerNFT = BackerNFT(_backerNFT);
        crowdToken = CrowdToken(_crowdToken);
        title = _title;
        ipfsHash = _ipfsHash;
        goalAmount = _goalAmount;
        deadline = _deadline;
        platformFeeBPS = _platformFeeBPS;
        state = CampaignState.ACTIVE;

        // Initialize milestones
        for (uint256 i = 0; i < _milestoneDescriptions.length; i++) {
            milestones.push(
                Milestone({
                    description: _milestoneDescriptions[i],
                    fundingBPS: _milestoneFundingBPS[i],
                    votingDeadline: 0,
                    state: MilestoneState.PENDING,
                    yesVotes: 0,
                    noVotes: 0,
                    fundsReleased: false
                })
            );
        }

        // Initialize NFT tiers
        for (uint256 i = 0; i < _nftTierThresholds.length; i++) {
            nftTiers.push(NFTTier({minContribution: _nftTierThresholds[i], tier: _nftTierValues[i]}));
        }
    }

    // ─────────────────────────────────────────────
    // Core functions
    // ─────────────────────────────────────────────

    /// @notice Contribute ETH to the campaign and receive NFT + CROWD tokens
    function contribute() external payable nonReentrant onlyActive {
        require(block.timestamp < deadline, "Campaign: deadline passed");
        require(msg.value > 0, "Campaign: contribution must be positive");

        // --- Effects ---
        bool isNewBacker = contributions[msg.sender].amount == 0;
        contributions[msg.sender].amount += msg.value;
        totalRaised += msg.value;

        if (isNewBacker) {
            backers.push(msg.sender);
        }

        // Determine NFT tier based on total contribution
        uint8 tier = _calculateTier(contributions[msg.sender].amount);
        contributions[msg.sender].nftTier = tier;

        // Calculate CROWD tokens: 1 ETH = 1000 CROWD (18 decimals)
        uint256 tokenAmount = (msg.value * crowdToken.TOKENS_PER_ETH() * 1e18) / 1 ether;

        emit ContributionMade(msg.sender, msg.value, tier, tokenAmount);

        // --- Interactions ---
        backerNFT.mint(msg.sender, tier, address(this), contributions[msg.sender].amount);
        crowdToken.mint(msg.sender, tokenAmount);
    }

    /// @notice Finalize campaign state once deadline has passed
    /// @dev Anyone can call this after the deadline
    function finalizeCampaign() external {
        require(state == CampaignState.ACTIVE, "Campaign: not active");
        require(block.timestamp >= deadline, "Campaign: deadline not reached");

        // --- Effects ---
        if (totalRaised >= goalAmount) {
            state = CampaignState.SUCCESSFUL;
        } else {
            state = CampaignState.FAILED;
            // All contributions become refundable
            for (uint256 i = 0; i < backers.length; i++) {
                address backer = backers[i];
                if (!contributions[backer].refunded) {
                    pendingRefunds[backer] += contributions[backer].amount;
                }
            }
        }

        emit CampaignFinalized(state);
    }

    /// @notice Creator requests release of a milestone's funds — opens 7-day voting
    /// @param milestoneIndex Index of the milestone to release
    function requestMilestoneRelease(uint256 milestoneIndex) external onlyCreator {
        require(state == CampaignState.SUCCESSFUL, "Campaign: not in SUCCESSFUL state");
        require(milestoneIndex < milestones.length, "Campaign: invalid milestone index");

        Milestone storage m = milestones[milestoneIndex];
        require(m.state == MilestoneState.PENDING, "Campaign: milestone not pending");

        // Milestones must be released in order
        if (milestoneIndex > 0) {
            require(
                milestones[milestoneIndex - 1].state == MilestoneState.APPROVED,
                "Campaign: previous milestone not approved"
            );
        }

        // --- Effects ---
        m.state = MilestoneState.VOTING;
        m.votingDeadline = block.timestamp + 7 days;

        emit MilestoneReleaseRequested(milestoneIndex, m.votingDeadline);
    }

    /// @notice Cast a weighted vote on a milestone
    /// @param milestoneIndex Index of the milestone
    /// @param support True = yes (approve), False = no (reject)
    function voteOnMilestone(uint256 milestoneIndex, bool support) external onlyBacker {
        require(milestoneIndex < milestones.length, "Campaign: invalid milestone index");

        Milestone storage m = milestones[milestoneIndex];
        require(m.state == MilestoneState.VOTING, "Campaign: milestone not in voting");
        require(block.timestamp < m.votingDeadline, "Campaign: voting period ended");
        require(!hasVoted[milestoneIndex][msg.sender], "Campaign: already voted");

        // --- Effects ---
        uint256 weight = contributions[msg.sender].amount; // Vote weight = ETH contributed
        hasVoted[milestoneIndex][msg.sender] = true;

        if (support) {
            m.yesVotes += weight;
        } else {
            m.noVotes += weight;
        }

        emit VoteCast(milestoneIndex, msg.sender, support, weight);
    }

    /// @notice Finalize vote after voting period ends; anyone can call
    /// @param milestoneIndex Index of the milestone
    function finalizeVote(uint256 milestoneIndex) external nonReentrant {
        require(milestoneIndex < milestones.length, "Campaign: invalid milestone index");

        Milestone storage m = milestones[milestoneIndex];
        require(m.state == MilestoneState.VOTING, "Campaign: milestone not in voting");
        require(block.timestamp >= m.votingDeadline, "Campaign: voting not ended");

        uint256 totalVotes = m.yesVotes + m.noVotes;
        uint256 minParticipation = totalRaised / 10; // 10% quorum

        // --- Effects first ---
        bool approved = (totalVotes >= minParticipation) && (m.yesVotes > m.noVotes);

        uint256 releasedAmount;
        if (approved) {
            m.state = MilestoneState.APPROVED;
            totalReleasedBPS += m.fundingBPS;

            // Calculate how much ETH to make available for withdrawal
            releasedAmount = (totalRaised * m.fundingBPS) / 10000;
            uint256 platformFee = (releasedAmount * platformFeeBPS) / 10000;
            uint256 creatorAmount = releasedAmount - platformFee;

            m.fundsReleased = true;

            // Check if all milestones completed
            if (totalReleasedBPS == 10000) {
                state = CampaignState.COMPLETED;
            }

            emit MilestoneFinalized(milestoneIndex, MilestoneState.APPROVED, releasedAmount);

            // --- Interaction: transfer platform fee ---
            if (platformFee > 0) {
                (bool feeOk, ) = factory.call{value: platformFee}("");
                require(feeOk, "Campaign: platform fee transfer failed");
            }

            // --- Interaction: transfer creator funds ---
            (bool ok, ) = creator.call{value: creatorAmount}("");
            require(ok, "Campaign: creator transfer failed");
        } else {
            // Milestone rejected — compute per-backer refund for this milestone's share
            m.state = MilestoneState.REJECTED;

            // Calculate refund: each backer gets back their proportional share of this milestone's funds
            // refund_i = contribution_i / totalRaised * milestone_allocation
            // But we only refund the unreleased portion
            // Simple approach: credit each backer (totalRaised - already released BPS)
            uint256 rejectedAllocation = (totalRaised * m.fundingBPS) / 10000;
            for (uint256 i = 0; i < backers.length; i++) {
                address backer = backers[i];
                uint256 backerShare = (contributions[backer].amount * rejectedAllocation) / totalRaised;
                pendingRefunds[backer] += backerShare;
            }

            state = CampaignState.FAILED;

            emit MilestoneFinalized(milestoneIndex, MilestoneState.REJECTED, 0);
        }
    }

    /// @notice Claim pending refunds (pull pattern)
    /// @dev pendingRefunds is set by finalizeCampaign() (goal not met) or
    ///      finalizeVote() (milestone rejected). Just use it directly.
    function claimRefund() external nonReentrant {
        uint256 refundAmount = pendingRefunds[msg.sender];
        require(refundAmount > 0, "Campaign: no pending refund");

        // --- Effects ---
        pendingRefunds[msg.sender] = 0;
        contributions[msg.sender].refunded = true;

        // --- Interaction ---
        (bool ok, ) = msg.sender.call{value: refundAmount}("");
        require(ok, "Campaign: refund transfer failed");

        emit RefundClaimed(msg.sender, refundAmount);
    }

    // ─────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────

    /// @notice Returns the number of milestones
    function getMilestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    /// @notice Returns full milestone data
    function getMilestone(uint256 index) external view returns (Milestone memory) {
        require(index < milestones.length, "Campaign: invalid index");
        return milestones[index];
    }

    /// @notice Returns all backers
    function getBackers() external view returns (address[] memory) {
        return backers;
    }

    /// @notice Returns the NFT tier count
    function getNFTTierCount() external view returns (uint256) {
        return nftTiers.length;
    }

    /// @notice Returns campaign summary info
    function getCampaignInfo()
        external
        view
        returns (
            string memory _title,
            string memory _ipfsHash,
            uint256 _goalAmount,
            uint256 _totalRaised,
            uint256 _deadline,
            CampaignState _state,
            uint256 _milestoneCount
        )
    {
        return (title, ipfsHash, goalAmount, totalRaised, deadline, state, milestones.length);
    }

    // ─────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────

    /// @dev Determine NFT tier based on total contribution amount
    /// nftTiers should be sorted descending by minContribution
    function _calculateTier(uint256 totalContribution) internal view returns (uint8) {
        for (uint256 i = 0; i < nftTiers.length; i++) {
            if (totalContribution >= nftTiers[i].minContribution) {
                return nftTiers[i].tier;
            }
        }
        // Default to lowest tier (Bronze)
        return 0;
    }

    /// @dev Receive ETH (from platform fee returns, etc.)
    receive() external payable {}
}
