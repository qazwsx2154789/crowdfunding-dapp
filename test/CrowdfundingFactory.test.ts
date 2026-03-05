import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { CrowdfundingFactory } from "../typechain-types";

describe("CrowdfundingFactory", function () {
  let factory: CrowdfundingFactory;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let defaultMilestones: string[];
  let defaultBPS: number[];
  let defaultTierThresholds: bigint[];
  let defaultTierValues: number[];

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("CrowdfundingFactory");
    factory = await Factory.deploy(owner.address);
    await factory.waitForDeployment();

    // Default valid campaign params
    defaultMilestones = ["Phase 1", "Phase 2"];
    defaultBPS = [5000, 5000];
    defaultTierThresholds = [ethers.parseEther("1"), ethers.parseEther("0.1"), 0n];
    defaultTierValues = [2, 1, 0];
  });

  // ─────────────────────────────────────────────
  // Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("Should deploy BackerNFT and CrowdToken", async function () {
      const nftAddr = await factory.getBackerNFTAddress();
      const tokenAddr = await factory.getCrowdTokenAddress();
      expect(nftAddr).to.not.equal(ethers.ZeroAddress);
      expect(tokenAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("Should set default platform fee to 250 BPS (2.5%)", async function () {
      expect(await factory.getPlatformFee()).to.equal(250);
    });
  });

  // ─────────────────────────────────────────────
  // Platform fee management
  // ─────────────────────────────────────────────

  describe("Platform fee management", function () {
    it("Should allow owner to update fee within limit", async function () {
      await expect(factory.connect(owner).updatePlatformFee(500))
        .to.emit(factory, "PlatformFeeUpdated")
        .withArgs(250, 500);
      expect(await factory.getPlatformFee()).to.equal(500);
    });

    it("Should revert if fee exceeds 10%", async function () {
      await expect(factory.connect(owner).updatePlatformFee(1001)).to.be.revertedWith(
        "Factory: fee exceeds maximum"
      );
    });

    it("Should revert if non-owner tries to update fee", async function () {
      await expect(factory.connect(alice).updatePlatformFee(100)).to.be.reverted;
    });

    it("Should allow owner to set fee to exactly 10% (1000 BPS)", async function () {
      await factory.connect(owner).updatePlatformFee(1000);
      expect(await factory.getPlatformFee()).to.equal(1000);
    });
  });

  // ─────────────────────────────────────────────
  // Campaign creation
  // ─────────────────────────────────────────────

  describe("createCampaign", function () {
    async function createDefault(caller: HardhatEthersSigner = alice) {
      const deadline = (await time.latest()) + 30 * 24 * 3600;
      return factory.connect(caller).createCampaign(
        "Test Campaign",
        "QmTest",
        ethers.parseEther("10"),
        deadline,
        defaultMilestones,
        defaultBPS,
        defaultTierThresholds,
        defaultTierValues
      );
    }

    it("Should deploy a campaign and emit CampaignCreated", async function () {
      const tx = await createDefault();
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l) => {
          try {
            return factory.interface.parseLog(l as Parameters<typeof factory.interface.parseLog>[0]);
          } catch {
            return null;
          }
        })
        .find((e) => e?.name === "CampaignCreated");

      expect(event).to.not.be.null;
      expect(event!.args.creator).to.equal(alice.address);
      expect(event!.args.title).to.equal("Test Campaign");
    });

    it("Should track campaigns in the registry", async function () {
      await createDefault();
      expect(await factory.getCampaignCount()).to.equal(1);
      const campaigns = await factory.getCampaigns();
      expect(campaigns).to.have.length(1);
    });

    it("Should authorize campaign to mint NFTs and tokens", async function () {
      const tx = await createDefault();
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l) => {
          try {
            return factory.interface.parseLog(l as Parameters<typeof factory.interface.parseLog>[0]);
          } catch {
            return null;
          }
        })
        .find((e) => e?.name === "CampaignCreated");

      const campaignAddr = event!.args.campaignAddress as string;
      const nftAddr = await factory.getBackerNFTAddress();
      const tokenAddr = await factory.getCrowdTokenAddress();

      const nft = await ethers.getContractAt("BackerNFT", nftAddr);
      const token = await ethers.getContractAt("CrowdToken", tokenAddr);

      expect(await nft.authorizedCampaigns(campaignAddr)).to.be.true;
      expect(await token.authorizedCampaigns(campaignAddr)).to.be.true;
    });

    it("Should track campaigns per creator", async function () {
      await createDefault(alice);
      await createDefault(alice);
      await createDefault(bob);

      const aliceCampaigns = await factory.getCampaignsByCreator(alice.address);
      const bobCampaigns = await factory.getCampaignsByCreator(bob.address);

      expect(aliceCampaigns).to.have.length(2);
      expect(bobCampaigns).to.have.length(1);
    });

    it("Should revert with empty title", async function () {
      const deadline = (await time.latest()) + 30 * 24 * 3600;
      await expect(
        factory.createCampaign("", "QmTest", ethers.parseEther("10"), deadline,
          defaultMilestones, defaultBPS, defaultTierThresholds, defaultTierValues)
      ).to.be.revertedWith("Factory: empty title");
    });

    it("Should revert if milestone BPS don't sum to 10000", async function () {
      const deadline = (await time.latest()) + 30 * 24 * 3600;
      await expect(
        factory.createCampaign("T", "QmT", ethers.parseEther("1"), deadline,
          ["M1", "M2"], [3000, 3000], defaultTierThresholds, defaultTierValues)
      ).to.be.revertedWith("Campaign: milestone BPS must sum to 10000");
    });

    it("Should revert if deadline is in the past", async function () {
      const past = (await time.latest()) - 1;
      await expect(
        factory.createCampaign("T", "QmT", ethers.parseEther("1"), past,
          defaultMilestones, defaultBPS, defaultTierThresholds, defaultTierValues)
      ).to.be.revertedWith("Factory: deadline in the past");
    });
  });

  // ─────────────────────────────────────────────
  // Platform fee withdrawal
  // ─────────────────────────────────────────────

  describe("withdrawPlatformFees", function () {
    it("Should revert if no fees accumulated", async function () {
      await expect(factory.connect(owner).withdrawPlatformFees()).to.be.revertedWith(
        "Factory: no fees to withdraw"
      );
    });
  });
});
