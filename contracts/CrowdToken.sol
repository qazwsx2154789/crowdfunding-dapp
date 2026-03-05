// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CrowdToken - ERC-20 platform reward token
/// @notice Minted proportionally to ETH contributions (1 ETH = 1000 CROWD)
contract CrowdToken is ERC20, Ownable {
    /// @notice Tokens minted per 1 ETH contributed
    uint256 public constant TOKENS_PER_ETH = 1000;

    /// @dev Tracks which Campaign contracts are authorized to mint
    mapping(address => bool) public authorizedCampaigns;

    event CampaignAuthorized(address indexed campaign);
    event CampaignRevoked(address indexed campaign);

    modifier onlyAuthorizedCampaign() {
        require(authorizedCampaigns[msg.sender], "CrowdToken: caller is not authorized campaign");
        _;
    }

    constructor(address initialOwner) ERC20("CrowdToken", "CROWD") Ownable(initialOwner) {}

    /// @notice Authorize a Campaign contract to mint tokens
    /// @dev Only callable by owner (CrowdfundingFactory)
    function authorizeCampaign(address campaign) external onlyOwner {
        require(campaign != address(0), "CrowdToken: zero address");
        authorizedCampaigns[campaign] = true;
        emit CampaignAuthorized(campaign);
    }

    /// @notice Revoke a Campaign contract's minting permission
    function revokeCampaign(address campaign) external onlyOwner {
        authorizedCampaigns[campaign] = false;
        emit CampaignRevoked(campaign);
    }

    /// @notice Mint tokens to a contributor
    /// @param to Recipient address
    /// @param amount Amount of tokens to mint (in wei, 18 decimals)
    function mint(address to, uint256 amount) external onlyAuthorizedCampaign {
        require(to != address(0), "CrowdToken: mint to zero address");
        _mint(to, amount);
    }
}
