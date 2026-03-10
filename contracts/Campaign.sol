// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BackerNFT.sol";
import "./CrowdToken.sol";

/// @title Campaign - Core crowdfunding logic per campaign instance
contract Campaign is ReentrancyGuard {

    enum CampaignState { ACTIVE, SUCCESSFUL, COMPLETED, FAILED }
    enum MilestoneState { PENDING, VOTING, APPROVED, REJECTED }

    struct Milestone {
        string description;
        uint256 fundingBPS;
        uint256 votingDeadline;
        MilestoneState state;
        uint256 yesVotes;
        uint256 noVotes;
        bool fundsReleased;
    }

    struct Contribution {
        uint256 amount;
        bool refunded;
    }

    address public immutable factory;
    address public immutable creator;
    BackerNFT public immutable backerNFT;
    CrowdToken public immutable crowdToken;

    string public title;
    string public ipfsHash;
    uint256 public goalAmount;
    uint256 public deadline;
    uint256 public platformFeeBPS;
    uint256 public votingDuration; // in seconds, set by creator

    uint256 public totalRaised;
    uint256 public totalReleasedBPS;

    CampaignState public state;
    Milestone[] public milestones;

    mapping(address => Contribution) public contributions;
    address[] public backers;

    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(address => uint256) public pendingRefunds;

    event ContributionMade(address indexed backer, uint256 amount, uint256 tokensMinted);
    event MilestoneReleaseRequested(uint256 indexed milestoneIndex, uint256 votingDeadline);
    event VoteCast(uint256 indexed milestoneIndex, address indexed voter, bool support, uint256 weight);
    event MilestoneFinalized(uint256 indexed milestoneIndex, MilestoneState result, uint256 fundsReleased);
    event RefundClaimed(address indexed backer, uint256 amount);
    event CampaignFinalized(CampaignState newState);

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

    constructor(
        address _creator,
        address _backerNFT,
        address _crowdToken,
        string memory _title,
        string memory _ipfsHash,
        uint256 _goalAmount,
        uint256 _deadline,
        uint256 _platformFeeBPS,
        uint256 _votingDuration,
        string[] memory _milestoneDescriptions,
        uint256[] memory _milestoneFundingBPS
    ) {
        require(_creator != address(0), "Campaign: zero creator");
        require(_backerNFT != address(0), "Campaign: zero NFT address");
        require(_crowdToken != address(0), "Campaign: zero token address");
        require(_goalAmount > 0, "Campaign: goal must be positive");
        require(_deadline > block.timestamp, "Campaign: deadline in the past");
        require(_votingDuration >= 60, "Campaign: voting duration must be at least 60 seconds");
        require(
            _milestoneDescriptions.length == _milestoneFundingBPS.length,
            "Campaign: milestone arrays length mismatch"
        );
        require(_milestoneDescriptions.length > 0, "Campaign: no milestones");

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
        votingDuration = _votingDuration;
        state = CampaignState.ACTIVE;

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
    }

    /// @notice Contribute ETH; receive CROWD tokens immediately. NFT minted at finalization.
    function contribute() external payable nonReentrant onlyActive {
        require(block.timestamp < deadline, "Campaign: deadline passed");
        require(msg.value > 0, "Campaign: contribution must be positive");

        bool isNewBacker = contributions[msg.sender].amount == 0;
        contributions[msg.sender].amount += msg.value;
        totalRaised += msg.value;

        if (isNewBacker) {
            backers.push(msg.sender);
        }

        uint256 tokenAmount = (msg.value * crowdToken.TOKENS_PER_ETH() * 1e18) / 1 ether;
        emit ContributionMade(msg.sender, msg.value, tokenAmount);
        crowdToken.mint(msg.sender, tokenAmount);
    }

    /// @notice Finalize campaign after deadline. Mints NFTs to all backers regardless of outcome.
    function finalizeCampaign() external {
        require(state == CampaignState.ACTIVE, "Campaign: not active");
        require(block.timestamp >= deadline, "Campaign: deadline not reached");

        if (totalRaised >= goalAmount) {
            state = CampaignState.SUCCESSFUL;
        } else {
            state = CampaignState.FAILED;
            for (uint256 i = 0; i < backers.length; i++) {
                address backer = backers[i];
                if (!contributions[backer].refunded) {
                    pendingRefunds[backer] += contributions[backer].amount;
                }
            }
        }

        // Mint NFTs to all backers: rank-based Gold/Silver/Bronze
        _mintNFTsToBackers();

        emit CampaignFinalized(state);
    }

    /// @notice Creator requests release of a milestone's funds (opens voting)
    function requestMilestoneRelease(uint256 milestoneIndex) external onlyCreator {
        require(state == CampaignState.SUCCESSFUL, "Campaign: not in SUCCESSFUL state");
        require(milestoneIndex < milestones.length, "Campaign: invalid milestone index");

        Milestone storage m = milestones[milestoneIndex];
        require(m.state == MilestoneState.PENDING, "Campaign: milestone not pending");

        if (milestoneIndex > 0) {
            require(
                milestones[milestoneIndex - 1].state == MilestoneState.APPROVED,
                "Campaign: previous milestone not approved"
            );
        }

        m.state = MilestoneState.VOTING;
        m.votingDeadline = block.timestamp + votingDuration;

        emit MilestoneReleaseRequested(milestoneIndex, m.votingDeadline);
    }

    /// @notice Cast a weighted vote on a milestone (weight = ETH contributed)
    function voteOnMilestone(uint256 milestoneIndex, bool support) external onlyBacker {
        require(milestoneIndex < milestones.length, "Campaign: invalid milestone index");

        Milestone storage m = milestones[milestoneIndex];
        require(m.state == MilestoneState.VOTING, "Campaign: milestone not in voting");
        require(block.timestamp < m.votingDeadline, "Campaign: voting period ended");
        require(!hasVoted[milestoneIndex][msg.sender], "Campaign: already voted");

        uint256 weight = contributions[msg.sender].amount;
        hasVoted[milestoneIndex][msg.sender] = true;

        if (support) {
            m.yesVotes += weight;
        } else {
            m.noVotes += weight;
        }

        emit VoteCast(milestoneIndex, msg.sender, support, weight);
    }

    /// @notice Finalize vote after voting period ends; anyone can call
    function finalizeVote(uint256 milestoneIndex) external nonReentrant {
        require(milestoneIndex < milestones.length, "Campaign: invalid milestone index");

        Milestone storage m = milestones[milestoneIndex];
        require(m.state == MilestoneState.VOTING, "Campaign: milestone not in voting");
        require(block.timestamp >= m.votingDeadline, "Campaign: voting not ended");

        uint256 totalVotes = m.yesVotes + m.noVotes;
        uint256 minParticipation = totalRaised / 10; // 10% quorum

        bool approved = (totalVotes >= minParticipation) && (m.yesVotes > m.noVotes);

        uint256 releasedAmount;
        if (approved) {
            m.state = MilestoneState.APPROVED;
            totalReleasedBPS += m.fundingBPS;

            releasedAmount = (totalRaised * m.fundingBPS) / 10000;
            uint256 platformFee = (releasedAmount * platformFeeBPS) / 10000;
            uint256 creatorAmount = releasedAmount - platformFee;

            m.fundsReleased = true;

            if (totalReleasedBPS == 10000) {
                state = CampaignState.COMPLETED;
            }

            emit MilestoneFinalized(milestoneIndex, MilestoneState.APPROVED, releasedAmount);

            if (platformFee > 0) {
                (bool feeOk, ) = factory.call{value: platformFee}("");
                require(feeOk, "Campaign: platform fee transfer failed");
            }

            (bool ok, ) = creator.call{value: creatorAmount}("");
            require(ok, "Campaign: creator transfer failed");
        } else {
            m.state = MilestoneState.REJECTED;

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
    function claimRefund() external nonReentrant {
        uint256 refundAmount = pendingRefunds[msg.sender];
        require(refundAmount > 0, "Campaign: no pending refund");

        pendingRefunds[msg.sender] = 0;
        contributions[msg.sender].refunded = true;

        (bool ok, ) = msg.sender.call{value: refundAmount}("");
        require(ok, "Campaign: refund transfer failed");

        emit RefundClaimed(msg.sender, refundAmount);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function getMilestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function getMilestone(uint256 index) external view returns (Milestone memory) {
        require(index < milestones.length, "Campaign: invalid index");
        return milestones[index];
    }

    function getBackers() external view returns (address[] memory) {
        return backers;
    }

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
            uint256 _milestoneCount,
            uint256 _votingDuration
        )
    {
        return (title, ipfsHash, goalAmount, totalRaised, deadline, state, milestones.length, votingDuration);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @dev Mint NFTs at finalization: #1 gets Gold, #2 gets Silver, rest get Bronze.
    ///      If only 1 backer, they receive both Gold and Silver.
    function _mintNFTsToBackers() internal {
        if (backers.length == 0) return;

        // Find top 2 contributors
        address first = address(0);
        address second = address(0);
        uint256 firstAmount = 0;
        uint256 secondAmount = 0;

        for (uint256 i = 0; i < backers.length; i++) {
            uint256 amount = contributions[backers[i]].amount;
            if (amount > firstAmount) {
                second = first;
                secondAmount = firstAmount;
                first = backers[i];
                firstAmount = amount;
            } else if (backers[i] != first && amount > secondAmount) {
                second = backers[i];
                secondAmount = amount;
            }
        }

        // Special case: only 1 backer → gets Gold + Silver
        if (backers.length == 1) {
            backerNFT.mint(first, 2, address(this), contributions[first].amount); // Gold
            backerNFT.mint(first, 1, address(this), contributions[first].amount); // Silver
            return;
        }

        // General case: mint based on rank
        for (uint256 i = 0; i < backers.length; i++) {
            address backer = backers[i];
            uint8 tier;
            if (backer == first) {
                tier = 2; // Gold
            } else if (backer == second) {
                tier = 1; // Silver
            } else {
                tier = 0; // Bronze
            }
            backerNFT.mint(backer, tier, address(this), contributions[backer].amount);
        }
    }

    receive() external payable {}
}
