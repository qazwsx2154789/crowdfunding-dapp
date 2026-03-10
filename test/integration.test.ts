/**
 * Integration Test: Full Campaign Lifecycle
 *
 * Scenario:
 *   1. Deploy platform (Factory)
 *   2. Creator creates campaign with 3 milestones (30% / 40% / 30%)
 *   3. 3 backers contribute different amounts (triggering different NFT tiers)
 *   4. Campaign deadline passes, meets goal → SUCCESSFUL
 *   5. Creator requests Milestone 0 release → voting opens
 *   6. Backers vote (majority YES) → APPROVED → funds transferred to creator
 *   7. Creator requests Milestone 1 release → voting opens
 *   8. Backers vote (majority NO) → REJECTED → backers can claim refund for M1
 *   9. Verify refund amounts are correct
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { CrowdfundingFactory, Campaign, BackerNFT, CrowdToken } from "../typechain-types";

describe("Integration: Full Campaign Lifecycle", function () {
  let factory: CrowdfundingFactory;
  let campaign: Campaign;
  let nft: BackerNFT;
  let token: CrowdToken;
  let owner: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let backer1: HardhatEthersSigner;
  let backer2: HardhatEthersSigner;
  let backer3: HardhatEthersSigner;
  let deadline: number;

  // NFT tier thresholds
  const GOLD_THRESHOLD = ethers.parseEther("1");    // >= 1 ETH = Gold
  const SILVER_THRESHOLD = ethers.parseEther("0.1"); // >= 0.1 ETH = Silver

  // Contribution amounts
  const BACKER1_AMOUNT = ethers.parseEther("5"); // Gold tier
  const BACKER2_AMOUNT = ethers.parseEther("3"); // Gold tier
  const BACKER3_AMOUNT = ethers.parseEther("2"); // Gold tier
  const TOTAL_RAISED = BACKER1_AMOUNT + BACKER2_AMOUNT + BACKER3_AMOUNT; // 10 ETH

  const GOAL = ethers.parseEther("10");
  const PLATFORM_FEE_BPS = 250n; // 2.5%

  before(async function () {
    [owner, creator, backer1, backer2, backer3] = await ethers.getSigners();

    // ── Step 1: Deploy Factory ──────────────────────────────
    const Factory = await ethers.getContractFactory("CrowdfundingFactory");
    factory = await Factory.deploy(owner.address);
    await factory.waitForDeployment();

    const nftAddr = await factory.getBackerNFTAddress();
    const tokenAddr = await factory.getCrowdTokenAddress();
    nft = await ethers.getContractAt("BackerNFT", nftAddr);
    token = await ethers.getContractAt("CrowdToken", tokenAddr);

    // ── Step 2: Creator creates campaign ───────────────────
    deadline = (await time.latest()) + 30 * 24 * 3600; // 30 days

    const tx = await factory.connect(creator).createCampaign(
      "Integration Test Campaign",
      "QmIntegration",
      GOAL,
      deadline,
      ["Milestone 1: Research", "Milestone 2: Development", "Milestone 3: Launch"],
      [3000, 4000, 3000], // 30% / 40% / 30%
      [GOLD_THRESHOLD, SILVER_THRESHOLD, 0n],
      [2, 1, 0] // Gold, Silver, Bronze
    );
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

    campaign = await ethers.getContractAt("Campaign", event!.args.campaignAddress as string);
  });

  // ── Step 3: Contributions ────────────────────────────────

  describe("Step 3: Backers contribute", function () {
    it("Backer1 contributes 5 ETH → Gold tier NFT + 5000 CROWD", async function () {
      await campaign.connect(backer1).contribute({ value: BACKER1_AMOUNT });
      const contrib = await campaign.contributions(backer1.address);
      expect(contrib.amount).to.equal(BACKER1_AMOUNT);
      expect(contrib.nftTier).to.equal(2); // Gold
      expect(await token.balanceOf(backer1.address)).to.equal(ethers.parseEther("5000"));
    });

    it("Backer2 contributes 3 ETH → Gold tier NFT + 3000 CROWD", async function () {
      await campaign.connect(backer2).contribute({ value: BACKER2_AMOUNT });
      const contrib = await campaign.contributions(backer2.address);
      expect(contrib.nftTier).to.equal(2); // Gold
      expect(await token.balanceOf(backer2.address)).to.equal(ethers.parseEther("3000"));
    });

    it("Backer3 contributes 2 ETH → Gold tier NFT + 2000 CROWD", async function () {
      await campaign.connect(backer3).contribute({ value: BACKER3_AMOUNT });
      const contrib = await campaign.contributions(backer3.address);
      expect(contrib.nftTier).to.equal(2); // Gold
      expect(await token.balanceOf(backer3.address)).to.equal(ethers.parseEther("2000"));
    });

    it("Total raised = 10 ETH", async function () {
      expect(await campaign.totalRaised()).to.equal(TOTAL_RAISED);
    });

    it("Each backer holds 1 NFT (3 total)", async function () {
      expect(await nft.balanceOf(backer1.address)).to.equal(1);
      expect(await nft.balanceOf(backer2.address)).to.equal(1);
      expect(await nft.balanceOf(backer3.address)).to.equal(1);
      expect(await nft.totalSupply()).to.equal(3);
    });
  });

  // ── Step 4: Campaign finalizes ───────────────────────────

  describe("Step 4: Campaign reaches deadline & finalized", function () {
    it("Should transition to SUCCESSFUL after deadline", async function () {
      await time.increaseTo(deadline + 1);
      await campaign.finalizeCampaign();
      const info = await campaign.getCampaignInfo();
      expect(info._state).to.equal(1); // SUCCESSFUL
    });
  });

  // ── Step 5-6: Milestone 0 approved ──────────────────────

  describe("Step 5-6: Milestone 0 — voting APPROVED", function () {
    it("Creator requests milestone 0 release → VOTING state", async function () {
      const tx = await campaign.connect(creator).requestMilestoneRelease(0);
      await expect(tx).to.emit(campaign, "MilestoneReleaseRequested");
      const m = await campaign.getMilestone(0);
      expect(m.state).to.equal(1); // VOTING
    });

    it("Backer1 and Backer2 vote YES (8 ETH weight)", async function () {
      await campaign.connect(backer1).voteOnMilestone(0, true);
      await campaign.connect(backer2).voteOnMilestone(0, true);
      const m = await campaign.getMilestone(0);
      expect(m.yesVotes).to.equal(BACKER1_AMOUNT + BACKER2_AMOUNT);
    });

    it("Backer3 votes NO (2 ETH weight)", async function () {
      await campaign.connect(backer3).voteOnMilestone(0, false);
      const m = await campaign.getMilestone(0);
      expect(m.noVotes).to.equal(BACKER3_AMOUNT);
    });

    it("After voting period: finalize → APPROVED, creator receives 2.925 ETH", async function () {
      await time.increase(7 * 24 * 3600 + 1);

      const creatorBefore = await ethers.provider.getBalance(creator.address);
      await campaign.finalizeVote(0);
      const creatorAfter = await ethers.provider.getBalance(creator.address);

      const m = await campaign.getMilestone(0);
      expect(m.state).to.equal(2); // APPROVED

      // Milestone 0 = 30% of 10 ETH = 3 ETH
      // Platform fee = 2.5% of 3 ETH = 0.075 ETH
      // Creator receives = 3 - 0.075 = 2.925 ETH
      const expectedTransfer = ethers.parseEther("2.925");
      expect(creatorAfter - creatorBefore).to.be.closeTo(expectedTransfer, ethers.parseEther("0.001"));
    });

    it("Platform fee accumulated in Factory", async function () {
      // 2.5% of 3 ETH = 0.075 ETH
      const factoryBalance = await ethers.provider.getBalance(await factory.getAddress());
      expect(factoryBalance).to.be.closeTo(ethers.parseEther("0.075"), ethers.parseEther("0.001"));
    });
  });

  // ── Step 7-8: Milestone 1 rejected ──────────────────────

  describe("Step 7-8: Milestone 1 — voting REJECTED", function () {
    it("Creator requests milestone 1 release → VOTING state", async function () {
      await campaign.connect(creator).requestMilestoneRelease(1);
      const m = await campaign.getMilestone(1);
      expect(m.state).to.equal(1); // VOTING
    });

    it("Backer3 votes YES (2 ETH), Backer1 and Backer2 vote NO (8 ETH)", async function () {
      await campaign.connect(backer3).voteOnMilestone(1, true);
      await campaign.connect(backer1).voteOnMilestone(1, false);
      await campaign.connect(backer2).voteOnMilestone(1, false);

      const m = await campaign.getMilestone(1);
      expect(m.noVotes).to.equal(BACKER1_AMOUNT + BACKER2_AMOUNT);
    });

    it("After voting period: finalize → REJECTED, campaign goes FAILED", async function () {
      await time.increase(7 * 24 * 3600 + 1);
      await campaign.finalizeVote(1);

      const m = await campaign.getMilestone(1);
      expect(m.state).to.equal(3); // REJECTED
      const info = await campaign.getCampaignInfo();
      expect(info._state).to.equal(3); // FAILED
    });
  });

  // ── Step 9: Refunds ──────────────────────────────────────

  describe("Step 9: Backers claim refunds for rejected milestone", function () {
    it("Backer1 receives proportional refund for milestone 1 (40% of 5 ETH)", async function () {
      // Backer1's share of milestone 1 = (5/10) * 40% * 10 ETH = 2 ETH
      const expectedRefund = ethers.parseEther("2");
      const pending = await campaign.pendingRefunds(backer1.address);
      expect(pending).to.be.closeTo(expectedRefund, ethers.parseEther("0.001"));

      const before = await ethers.provider.getBalance(backer1.address);
      const tx = await campaign.connect(backer1).claimRefund();
      const receipt = await tx.wait();
      const effectiveGasPrice = receipt!.gasPrice ?? tx.gasPrice ?? 0n;
      const gasUsed = receipt!.gasUsed * effectiveGasPrice;
      const after = await ethers.provider.getBalance(backer1.address);

      expect(after + gasUsed - before).to.be.closeTo(expectedRefund, ethers.parseEther("0.001"));
    });

    it("Backer2 receives proportional refund for milestone 1 (40% of 3 ETH = 1.2 ETH)", async function () {
      const expectedRefund = ethers.parseEther("1.2");
      const pending = await campaign.pendingRefunds(backer2.address);
      expect(pending).to.be.closeTo(expectedRefund, ethers.parseEther("0.001"));
    });

    it("Backer3 receives proportional refund for milestone 1 (40% of 2 ETH = 0.8 ETH)", async function () {
      const expectedRefund = ethers.parseEther("0.8");
      const pending = await campaign.pendingRefunds(backer3.address);
      expect(pending).to.be.closeTo(expectedRefund, ethers.parseEther("0.001"));
    });

    it("Owner can withdraw accumulated platform fees", async function () {
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx = await factory.connect(owner).withdrawPlatformFees();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * tx.gasPrice!;
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      // 0.075 ETH fee from milestone 0 approval
      expect(ownerAfter + gasUsed - ownerBefore).to.be.closeTo(
        ethers.parseEther("0.075"),
        ethers.parseEther("0.001")
      );
    });
  });
});
