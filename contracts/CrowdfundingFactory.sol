// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Campaign.sol";
import "./BackerNFT.sol";
import "./CrowdToken.sol";

/*
 * CrowdfundingFactory is the entry point of the CrowdChain platform.
 * It is responsible for deploying new Campaign contracts and managing shared platform resources.
 *
 * Key responsibilities:
 * - Deploy a new Campaign contract for each fundraising activity via createCampaign()
 * - Maintain a registry of all deployed Campaign contracts
 * - Hold references to the shared BackerNFT and CrowdToken contracts
 * - Authorize each new Campaign to mint NFTs and CROWD tokens
 * - Collect and withdraw platform fees (2.5% of each approved milestone payout)
 *
 * This contract consists of 1 core contract:
 * 1. CrowdfundingFactory: Platform entry point, campaign deployer, and fee collector
 */

/// @title CrowdfundingFactory - Platform entry point and campaign deployer
contract CrowdfundingFactory is Ownable, ReentrancyGuard {

    uint256 public constant MAX_FEE_BPS = 1000;
    uint256 public constant DEFAULT_FEE_BPS = 250;

    BackerNFT public immutable backerNFT;
    CrowdToken public immutable crowdToken;

    uint256 public platformFeeBPS;

    address[] private _campaigns;
    mapping(address => bool) public isCampaign;
    mapping(address => address[]) public creatorCampaigns;

    event CampaignCreated(
        address indexed campaignAddress,
        address indexed creator,
        string title,
        uint256 goalAmount,
        uint256 deadline
    );
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event PlatformFeeWithdrawn(address indexed to, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {
        platformFeeBPS = DEFAULT_FEE_BPS;
        backerNFT = new BackerNFT(address(this));
        crowdToken = new CrowdToken(address(this));
    }

    /// @notice Deploy a new Campaign contract
    /// @param _title Campaign title
    /// @param _ipfsHash IPFS CID for campaign details (image + description)
    /// @param _goalAmount Fundraising goal in wei
    /// @param _deadline Unix timestamp for campaign end (minute precision supported)
    /// @param _votingDuration Voting period in seconds (minimum 60)
    /// @param _milestoneDescriptions Array of milestone descriptions
    /// @param _milestoneFundingBPS Array of milestone funding % in BPS (must sum to 10000)
    function createCampaign(
        string calldata _title,
        string calldata _ipfsHash,
        uint256 _goalAmount,
        uint256 _deadline,
        uint256 _votingDuration,
        string[] calldata _milestoneDescriptions,
        uint256[] calldata _milestoneFundingBPS
    ) external returns (address campaignAddress) {
        require(bytes(_title).length > 0, "Factory: empty title");
        require(_goalAmount > 0, "Factory: goal must be positive");
        require(_deadline > block.timestamp, "Factory: deadline in the past");
        require(_votingDuration >= 60, "Factory: voting duration must be at least 60 seconds");
        require(_milestoneDescriptions.length > 0, "Factory: no milestones");
        require(
            _milestoneDescriptions.length == _milestoneFundingBPS.length,
            "Factory: milestone array length mismatch"
        );

        Campaign campaign = new Campaign(
            msg.sender,
            address(backerNFT),
            address(crowdToken),
            _title,
            _ipfsHash,
            _goalAmount,
            _deadline,
            platformFeeBPS,
            _votingDuration,
            _milestoneDescriptions,
            _milestoneFundingBPS
        );

        campaignAddress = address(campaign);

        _campaigns.push(campaignAddress);
        isCampaign[campaignAddress] = true;
        creatorCampaigns[msg.sender].push(campaignAddress);

        backerNFT.authorizeCampaign(campaignAddress);
        crowdToken.authorizeCampaign(campaignAddress);

        emit CampaignCreated(campaignAddress, msg.sender, _title, _goalAmount, _deadline);
    }

    function updatePlatformFee(uint256 newFeeBPS) external onlyOwner {
        require(newFeeBPS <= MAX_FEE_BPS, "Factory: fee exceeds maximum");
        uint256 oldFee = platformFeeBPS;
        platformFeeBPS = newFeeBPS;
        emit PlatformFeeUpdated(oldFee, newFeeBPS);
    }

    function withdrawPlatformFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "Factory: no fees to withdraw");
        (bool ok, ) = owner().call{value: balance}("");
        require(ok, "Factory: withdrawal failed");
        emit PlatformFeeWithdrawn(owner(), balance);
    }

    function getPlatformFee() external view returns (uint256) {
        return platformFeeBPS;
    }

    function getCampaigns() external view returns (address[] memory) {
        return _campaigns;
    }

    function getCampaignCount() external view returns (uint256) {
        return _campaigns.length;
    }

    function getCampaignsByCreator(address creator) external view returns (address[] memory) {
        return creatorCampaigns[creator];
    }

    function getBackerNFTAddress() external view returns (address) {
        return address(backerNFT);
    }

    function getCrowdTokenAddress() external view returns (address) {
        return address(crowdToken);
    }

    receive() external payable {}
}
