import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { BackerNFT } from "../typechain-types";

describe("BackerNFT", function () {
  let nft: BackerNFT;
  let owner: HardhatEthersSigner;
  let campaign: HardhatEthersSigner;
  let user: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, campaign, user] = await ethers.getSigners();

    const BackerNFTFactory = await ethers.getContractFactory("BackerNFT");
    nft = await BackerNFTFactory.deploy(owner.address);
    await nft.waitForDeployment();

    // Authorize campaign address
    await nft.connect(owner).authorizeCampaign(campaign.address);
  });

  describe("Authorization", function () {
    it("Should authorize a campaign", async function () {
      expect(await nft.authorizedCampaigns(campaign.address)).to.be.true;
    });

    it("Should emit CampaignAuthorized event", async function () {
      const [, , , newCampaign] = await ethers.getSigners();
      await expect(nft.connect(owner).authorizeCampaign(newCampaign.address))
        .to.emit(nft, "CampaignAuthorized")
        .withArgs(newCampaign.address);
    });

    it("Should revoke a campaign", async function () {
      await nft.connect(owner).revokeCampaign(campaign.address);
      expect(await nft.authorizedCampaigns(campaign.address)).to.be.false;
    });

    it("Should revert mint from unauthorized caller", async function () {
      await expect(
        nft.connect(user).mint(user.address, 0, campaign.address, ethers.parseEther("1"))
      ).to.be.revertedWith("BackerNFT: caller is not authorized campaign");
    });
  });

  describe("Minting", function () {
    it("Should mint a Bronze NFT (tier 0)", async function () {
      await nft.connect(campaign).mint(user.address, 0, campaign.address, ethers.parseEther("0.01"));
      expect(await nft.balanceOf(user.address)).to.equal(1);
      expect(await nft.ownerOf(0)).to.equal(user.address);
    });

    it("Should mint a Silver NFT (tier 1)", async function () {
      await nft.connect(campaign).mint(user.address, 1, campaign.address, ethers.parseEther("0.5"));
      const data = await nft.getNFTData(0);
      expect(data.tier).to.equal(1);
    });

    it("Should mint a Gold NFT (tier 2)", async function () {
      await nft.connect(campaign).mint(user.address, 2, campaign.address, ethers.parseEther("2"));
      const data = await nft.getNFTData(0);
      expect(data.tier).to.equal(2);
    });

    it("Should emit NFTMinted event", async function () {
      await expect(
        nft.connect(campaign).mint(user.address, 1, campaign.address, ethers.parseEther("0.5"))
      ).to.emit(nft, "NFTMinted");
    });

    it("Should track totalSupply correctly", async function () {
      await nft.connect(campaign).mint(user.address, 0, campaign.address, 1000n);
      await nft.connect(campaign).mint(user.address, 1, campaign.address, 2000n);
      expect(await nft.totalSupply()).to.equal(2);
    });

    it("Should revert for invalid tier", async function () {
      await expect(
        nft.connect(campaign).mint(user.address, 3, campaign.address, 1000n)
      ).to.be.revertedWith("BackerNFT: invalid tier");
    });

    it("Should revert minting to zero address", async function () {
      await expect(
        nft.connect(campaign).mint(ethers.ZeroAddress, 0, campaign.address, 1000n)
      ).to.be.revertedWith("BackerNFT: mint to zero address");
    });
  });

  describe("tokenURI", function () {
    it("Should return valid Base64 JSON", async function () {
      await nft.connect(campaign).mint(user.address, 2, campaign.address, ethers.parseEther("1"));
      const uri = await nft.tokenURI(0);

      expect(uri).to.match(/^data:application\/json;base64,/);

      const base64 = uri.replace("data:application/json;base64,", "");
      const decoded = Buffer.from(base64, "base64").toString("utf8");
      const json = JSON.parse(decoded) as { name: string; attributes: unknown[]; image: string };

      expect(json.name).to.include("Gold");
      expect(json.attributes).to.be.an("array");
      expect(json.image).to.match(/^data:image\/svg\+xml;base64,/);
    });

    it("Should revert for non-existent token", async function () {
      await expect(nft.tokenURI(999)).to.be.reverted;
    });
  });
});
