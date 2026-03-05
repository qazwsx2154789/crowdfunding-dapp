// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Campaign.sol";
import "./BackerNFT.sol";
import "./CrowdToken.sol";

/// @title CrowdfundingFactory - Platform entry point and campaign deployer
/// @notice Deploys Campaign contracts, manages platform fee, authorizes NFT/token minting
contract CrowdfundingFactory is Ownable, ReentrancyGuard {
    // ─────────────────────────────────────────────
    // Constants & State
    // ─────────────────────────────────────────────

    uint256 public constant MAX_FEE_BPS = 1000; // 10% maximum platform fee
    uint256 public constant DEFAULT_FEE_BPS = 250; // 2.5% default platform fee

    BackerNFT public immutable backerNFT;
    CrowdToken public immutable crowdToken;

    uint256 public platformFeeBPS;

    address[] private _campaigns;
    mapping(address => bool) public isCampaign;
    mapping(address => address[]) public creatorCampaigns; // creator => list of their campaigns

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event CampaignCreated(
        address indexed campaignAddress,
        address indexed creator,
        string title,
        uint256 goalAmount,
        uint256 deadline
    );
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event PlatformFeeWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(address initialOwner) Ownable(initialOwner) {
        platformFeeBPS = DEFAULT_FEE_BPS;

        // Deploy shared NFT and token contracts
        backerNFT = new BackerNFT(address(this));
        crowdToken = new CrowdToken(address(this));
    }

    // ─────────────────────────────────────────────
    // Campaign creation
    // ─────────────────────────────────────────────

    /// @notice Deploy a new Campaign contract
    /// @param _title Campaign title
    /// @param _ipfsHash IPFS hash for campaign details
    /// @param _goalAmount Fundraising goal in wei
    /// @param _deadline Unix timestamp for campaign end
    /// @param _milestoneDescriptions Array of milestone descriptions
    /// @param _milestoneFundingBPS Array of milestone funding percentages in BPS (must sum to 10000)
    /// @param _nftTierThresholds Min ETH thresholds per NFT tier (wei), sorted descending
    /// @param _nftTierValues NFT tier values corresponding to thresholds (0=Bronze,1=Silver,2=Gold)
    /// @return campaignAddress Address of the newly deployed Campaign
    function createCampaign(
        string calldata _title,
        string calldata _ipfsHash,
        uint256 _goalAmount,
        uint256 _deadline,
        string[] calldata _milestoneDescriptions,
        uint256[] calldata _milestoneFundingBPS,
        uint256[] calldata _nftTierThresholds,
        uint8[] calldata _nftTierValues
    ) external returns (address campaignAddress) {
        require(bytes(_title).length > 0, "Factory: empty title");
        require(_goalAmount > 0, "Factory: goal must be positive");
        require(_deadline > block.timestamp, "Factory: deadline in the past");
        require(_milestoneDescriptions.length > 0, "Factory: no milestones");
        require(
            _milestoneDescriptions.length == _milestoneFundingBPS.length,
            "Factory: milestone array length mismatch"
        );
        require(
            _nftTierThresholds.length == _nftTierValues.length,
            "Factory: NFT tier array length mismatch"
        );

        // Deploy Campaign contract
        Campaign campaign = new Campaign(
            msg.sender,
            address(backerNFT),
            address(crowdToken),
            _title,
            _ipfsHash,
            _goalAmount,
            _deadline,
            platformFeeBPS,
            _milestoneDescriptions,
            _milestoneFundingBPS,
            _nftTierThresholds,
            _nftTierValues
        );

        campaignAddress = address(campaign);

        // Register campaign in tracking
        _campaigns.push(campaignAddress);
        isCampaign[campaignAddress] = true;
        creatorCampaigns[msg.sender].push(campaignAddress);

        // Authorize campaign to mint NFTs and tokens
        backerNFT.authorizeCampaign(campaignAddress);
        crowdToken.authorizeCampaign(campaignAddress);

        emit CampaignCreated(campaignAddress, msg.sender, _title, _goalAmount, _deadline);
    }

    // ─────────────────────────────────────────────
    // Fee management
    // ─────────────────────────────────────────────

    /// @notice Update the platform fee (max 10%)
    /// @param newFeeBPS New fee in basis points
    function updatePlatformFee(uint256 newFeeBPS) external onlyOwner {
        require(newFeeBPS <= MAX_FEE_BPS, "Factory: fee exceeds maximum");
        uint256 oldFee = platformFeeBPS;
        platformFeeBPS = newFeeBPS;
        emit PlatformFeeUpdated(oldFee, newFeeBPS);
    }

    /// @notice Withdraw accumulated platform fees
    function withdrawPlatformFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "Factory: no fees to withdraw");

        (bool ok, ) = owner().call{value: balance}("");
        require(ok, "Factory: withdrawal failed");

        emit PlatformFeeWithdrawn(owner(), balance);
    }

    // ─────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────

    /// @notice Returns current platform fee in basis points
    function getPlatformFee() external view returns (uint256) {
        return platformFeeBPS;
    }

    /// @notice Returns all deployed campaign addresses
    function getCampaigns() external view returns (address[] memory) {
        return _campaigns;
    }

    /// @notice Returns total number of campaigns
    function getCampaignCount() external view returns (uint256) {
        return _campaigns.length;
    }

    /// @notice Returns campaigns created by a specific address
    function getCampaignsByCreator(address creator) external view returns (address[] memory) {
        return creatorCampaigns[creator];
    }

    /// @notice Returns BackerNFT contract address
    function getBackerNFTAddress() external view returns (address) {
        return address(backerNFT);
    }

    /// @notice Returns CrowdToken contract address
    function getCrowdTokenAddress() external view returns (address) {
        return address(crowdToken);
    }

    /// @dev Receive ETH platform fees from Campaign contracts
    receive() external payable {}
}
