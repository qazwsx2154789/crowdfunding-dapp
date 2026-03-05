// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title BackerNFT - ERC-721 reward NFT for campaign backers
/// @notice Supports Bronze/Silver/Gold tiers; minted by authorized Campaign contracts
contract BackerNFT is ERC721, Ownable {
    using Strings for uint256;
    using Strings for address;

    /// @notice NFT tiers
    enum Tier {
        Bronze,
        Silver,
        Gold
    }

    struct NFTData {
        address campaign;
        Tier tier;
        uint256 contributionAmount; // in wei
        uint256 mintedAt;
    }

    uint256 private _nextTokenId;

    /// @dev Tracks which Campaign contracts are authorized to mint
    mapping(address => bool) public authorizedCampaigns;

    /// @dev Token metadata storage
    mapping(uint256 => NFTData) private _nftData;

    event CampaignAuthorized(address indexed campaign);
    event CampaignRevoked(address indexed campaign);
    event NFTMinted(uint256 indexed tokenId, address indexed to, address indexed campaign, Tier tier);

    modifier onlyAuthorizedCampaign() {
        require(authorizedCampaigns[msg.sender], "BackerNFT: caller is not authorized campaign");
        _;
    }

    constructor(address initialOwner) ERC721("CrowdfundingBackerNFT", "BACKER") Ownable(initialOwner) {}

    /// @notice Authorize a Campaign contract to mint NFTs
    function authorizeCampaign(address campaign) external onlyOwner {
        require(campaign != address(0), "BackerNFT: zero address");
        authorizedCampaigns[campaign] = true;
        emit CampaignAuthorized(campaign);
    }

    /// @notice Revoke a Campaign contract's minting permission
    function revokeCampaign(address campaign) external onlyOwner {
        authorizedCampaigns[campaign] = false;
        emit CampaignRevoked(campaign);
    }

    /// @notice Mint a Backer NFT to a contributor
    /// @param to Recipient address
    /// @param tier NFT tier (0=Bronze, 1=Silver, 2=Gold)
    /// @param campaign Campaign contract address
    /// @param contributionAmount ETH contributed in wei
    /// @return tokenId The minted token ID
    function mint(
        address to,
        uint8 tier,
        address campaign,
        uint256 contributionAmount
    ) external onlyAuthorizedCampaign returns (uint256 tokenId) {
        require(to != address(0), "BackerNFT: mint to zero address");
        require(tier <= uint8(Tier.Gold), "BackerNFT: invalid tier");

        tokenId = _nextTokenId++;
        _nftData[tokenId] = NFTData({
            campaign: campaign,
            tier: Tier(tier),
            contributionAmount: contributionAmount,
            mintedAt: block.timestamp
        });

        _safeMint(to, tokenId);
        emit NFTMinted(tokenId, to, campaign, Tier(tier));
    }

    /// @notice Returns on-chain Base64-encoded JSON metadata
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        NFTData memory data = _nftData[tokenId];
        string memory tierName = _tierName(data.tier);
        string memory tierColor = _tierColor(data.tier);
        string memory svgImage = _buildSVG(tierName, tierColor, data.contributionAmount);

        string memory json = Base64.encode(
            bytes(
                string.concat(
                    '{"name":"Crowdfunding Backer #',
                    tokenId.toString(),
                    " - ",
                    tierName,
                    '","description":"A ',
                    tierName,
                    " tier backer NFT for campaign ",
                    Strings.toHexString(uint160(data.campaign), 20),
                    '","image":"data:image/svg+xml;base64,',
                    Base64.encode(bytes(svgImage)),
                    '","attributes":[{"trait_type":"Tier","value":"',
                    tierName,
                    '"},{"trait_type":"Campaign","value":"',
                    Strings.toHexString(uint160(data.campaign), 20),
                    '"},{"trait_type":"Contribution (ETH wei)","value":"',
                    data.contributionAmount.toString(),
                    '"},{"trait_type":"Minted At","value":',
                    data.mintedAt.toString(),
                    "}]}"
                )
            )
        );

        return string.concat("data:application/json;base64,", json);
    }

    /// @notice Get raw NFT data
    function getNFTData(uint256 tokenId) external view returns (NFTData memory) {
        _requireOwned(tokenId);
        return _nftData[tokenId];
    }

    /// @notice Total number of NFTs minted
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    // ─────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────

    function _tierName(Tier tier) internal pure returns (string memory) {
        if (tier == Tier.Gold) return "Gold";
        if (tier == Tier.Silver) return "Silver";
        return "Bronze";
    }

    function _tierColor(Tier tier) internal pure returns (string memory) {
        if (tier == Tier.Gold) return "#FFD700";
        if (tier == Tier.Silver) return "#C0C0C0";
        return "#CD7F32";
    }

    function _buildSVG(
        string memory tierName,
        string memory color,
        uint256 contributionWei
    ) internal pure returns (string memory) {
        string memory ethAmount = _formatEth(contributionWei);
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">',
            '<rect width="300" height="300" rx="20" fill="#1a1a2e"/>',
            '<rect x="10" y="10" width="280" height="280" rx="15" fill="none" stroke="',
            color,
            '" stroke-width="3"/>',
            '<circle cx="150" cy="100" r="50" fill="',
            color,
            '" opacity="0.2"/>',
            '<text x="150" y="108" font-family="Arial" font-size="40" text-anchor="middle" fill="',
            color,
            '">&#127942;</text>',
            '<text x="150" y="175" font-family="Arial" font-size="22" font-weight="bold" text-anchor="middle" fill="',
            color,
            '">',
            tierName,
            " Backer</text>",
            '<text x="150" y="210" font-family="Arial" font-size="14" text-anchor="middle" fill="#aaaaaa">Contributed: ',
            ethAmount,
            " ETH</text>",
            '<text x="150" y="260" font-family="Arial" font-size="12" text-anchor="middle" fill="#666666">Crowdfunding Platform</text>',
            "</svg>"
        );
    }

    /// @dev Converts wei to a simplified ETH string (up to 4 decimal places)
    function _formatEth(uint256 wei_) internal pure returns (string memory) {
        uint256 whole = wei_ / 1 ether;
        uint256 frac = (wei_ % 1 ether) / 1e14; // 4 decimal places
        if (frac == 0) {
            return whole.toString();
        }
        return string.concat(whole.toString(), ".", _padLeft(frac.toString(), 4));
    }

    /// @dev Left-pad a string with zeros to a minimum length
    function _padLeft(string memory s, uint256 minLen) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        if (b.length >= minLen) return s;
        bytes memory padded = new bytes(minLen);
        uint256 offset = minLen - b.length;
        for (uint256 i = 0; i < offset; i++) {
            padded[i] = "0";
        }
        for (uint256 i = 0; i < b.length; i++) {
            padded[offset + i] = b[i];
        }
        return string(padded);
    }
}
