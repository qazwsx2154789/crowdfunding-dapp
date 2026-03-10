import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { CrowdfundingFactory, Campaign } from "../typechain-types";

interface DeployOverrides {
  deadline?: number;
  goalAmount?: bigint;
  milestoneDescs?: string[];
  milestoneBPS?: number[];
  tierThresholds?: bigint[];
  tierValues?: number[];
}

interface DeployResult {
  factory: CrowdfundingFactory;
  campaign: Campaign;
  owner: HardhatEthersSigner;
  creator: HardhatEthersSigner;
  backer1: HardhatEthersSigner;
  backer2: HardhatEthersSigner;
  backer3: HardhatEthersSigner;
  deadline: number;
}

// Helper: deploy factory and create one campaign
async function deployAndCreateCampaign(overrides: DeployOverrides = {}): Promise<DeployResult> {
  const [owner, creator, backer1, backer2, backer3] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("CrowdfundingFactory");
  const factory = await Factory.deploy(owner.address);
  await factory.waitForDeployment();

  const deadline = overrides.deadline ?? (await time.latest()) + 30 * 24 * 3600;
  const goalAmount = overrides.goalAmount ?? ethers.parseEther("10");
  const milestoneDescs = overrides.milestoneDescs ?? ["M1", "M2", "M3"];
  const milestoneBPS = overrides.milestoneBPS ?? [3000, 4000, 3000];
  const tierThresholds = overrides.tierThresholds ?? [
    ethers.parseEther("1"),
    ethers.parseEther("0.1"),
    0n,
  ];
  const tierValues = overrides.tierValues ?? [2, 1, 0]; // Gold, Silver, Bronze

  const tx = await factory.connect(creator).createCampaign(
    "Test Campaign",
    "QmTest",
    goalAmount,
    deadline,
    milestoneDescs,
    milestoneBPS,
    tierThresholds,
    tierValues
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

  const campaign = await ethers.getContractAt("Campaign", event!.args.campaignAddress as string);

  return { factory, campaign, owner, creator, backer1, backer2, backer3, deadline };
}

describe("Campaign", function () {
  // ─────────────────────────────────────────────
  // Deployment / initial state
  // ─────────────────────────────────────────────
  describe("Initial state", function () {
    it("Should set correct campaign info", async function () {
      const { campaign } = await deployAndCreateCampaign();
      const info = await campaign.getCampaignInfo();
      expect(info._title).to.equal("Test Campaign");
      expect(info._goalAmount).to.equal(ethers.parseEther("10"));
      expect(info._state).to.equal(0); // ACTIVE
      expect(info._milestoneCount).to.equal(3);
    });

    it("Should set correct milestone BPS", async function () {
      const { campaign } = await deployAndCreateCampaign();
      const m0 = await campaign.getMilestone(0);
      const m1 = await campaign.getMilestone(1);
      const m2 = await campaign.getMilestone(2);
      expect(m0.fundingBPS).to.equal(3000);
      expect(m1.fundingBPS).to.equal(4000);
      expect(m2.fundingBPS).to.equal(3000);
    });
  });

  // ─────────────────────────────────────────────
  // Contributing
  // ─────────────────────────────────────────────
  describe("contribute()", function () {
    it("Should accept ETH and update totalRaised", async function () {
      const { campaign, backer1 } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("1") });
      expect(await campaign.totalRaised()).to.equal(ethers.parseEther("1"));
    });

    it("Should emit ContributionMade event", async function () {
      const { campaign, backer1 } = await deployAndCreateCampaign();
      await expect(campaign.connect(backer1).contribute({ value: ethers.parseEther("1") }))
        .to.emit(campaign, "ContributionMade");
    });

    it("Should assign Gold tier for >= 1 ETH", async function () {
      const { campaign, backer1 } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("1") });
      const contrib = await campaign.contributions(backer1.address);
      expect(contrib.nftTier).to.equal(2); // Gold
    });

    it("Should assign Silver tier for >= 0.1 ETH", async function () {
      const { campaign, backer1 } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("0.1") });
      const contrib = await campaign.contributions(backer1.address);
      expect(contrib.nftTier).to.equal(1); // Silver
    });

    it("Should assign Bronze tier for small amounts", async function () {
      const { campaign, backer1 } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("0.01") });
      const contrib = await campaign.contributions(backer1.address);
      expect(contrib.nftTier).to.equal(0); // Bronze
    });

    it("Should mint CROWD tokens (1 ETH = 1000 CROWD)", async function () {
      const { factory, campaign, backer1 } = await deployAndCreateCampaign();
      const tokenAddr = await factory.getCrowdTokenAddress();
      const token = await ethers.getContractAt("CrowdToken", tokenAddr);

      await campaign.connect(backer1).contribute({ value: ethers.parseEther("2") });
      const balance = await token.balanceOf(backer1.address);
      expect(balance).to.equal(ethers.parseEther("2000")); // 2 ETH * 1000
    });

    it("Should mint a BackerNFT", async function () {
      const { factory, campaign, backer1 } = await deployAndCreateCampaign();
      const nftAddr = await factory.getBackerNFTAddress();
      const nft = await ethers.getContractAt("BackerNFT", nftAddr);

      await campaign.connect(backer1).contribute({ value: ethers.parseEther("1") });
      expect(await nft.balanceOf(backer1.address)).to.equal(1);
    });

    it("Should accumulate contributions from same backer", async function () {
      const { campaign, backer1 } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("0.5") });
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("0.5") });
      const contrib = await campaign.contributions(backer1.address);
      expect(contrib.amount).to.equal(ethers.parseEther("1"));
    });

    it("Should revert if deadline passed", async function () {
      const { campaign, backer1, deadline } = await deployAndCreateCampaign();
      await time.increaseTo(deadline + 1);
      await expect(
        campaign.connect(backer1).contribute({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Campaign: deadline passed");
    });

    it("Should revert with zero value", async function () {
      const { campaign, backer1 } = await deployAndCreateCampaign();
      await expect(
        campaign.connect(backer1).contribute({ value: 0 })
      ).to.be.revertedWith("Campaign: contribution must be positive");
    });
  });

  // ─────────────────────────────────────────────
  // Campaign finalization
  // ─────────────────────────────────────────────
  describe("finalizeCampaign()", function () {
    it("Should transition to SUCCESSFUL if goal met", async function () {
      const { campaign, backer1, deadline } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("10") });
      await time.increaseTo(deadline + 1);
      await campaign.finalizeCampaign();
      expect((await campaign.getCampaignInfo())._state).to.equal(1); // SUCCESSFUL
    });

    it("Should transition to FAILED if goal not met", async function () {
      const { campaign, backer1, deadline } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("5") }); // below 10 ETH goal
      await time.increaseTo(deadline + 1);
      await campaign.finalizeCampaign();
      expect((await campaign.getCampaignInfo())._state).to.equal(3); // FAILED
    });

    it("Should credit full refunds when campaign fails", async function () {
      const { campaign, backer1, deadline } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("5") });
      await time.increaseTo(deadline + 1);
      await campaign.finalizeCampaign();

      const refund = await campaign.pendingRefunds(backer1.address);
      expect(refund).to.equal(ethers.parseEther("5"));
    });

    it("Should revert if deadline not reached", async function () {
      const { campaign } = await deployAndCreateCampaign();
      await expect(campaign.finalizeCampaign()).to.be.revertedWith("Campaign: deadline not reached");
    });
  });

  // ─────────────────────────────────────────────
  // Milestone release request
  // ─────────────────────────────────────────────
  describe("requestMilestoneRelease()", function () {
    async function successfulCampaign() {
      const ctx = await deployAndCreateCampaign();
      await ctx.campaign.connect(ctx.backer1).contribute({ value: ethers.parseEther("10") });
      await time.increaseTo(ctx.deadline + 1);
      await ctx.campaign.finalizeCampaign();
      return ctx;
    }

    it("Should open voting period for milestone 0", async function () {
      const { campaign, creator } = await successfulCampaign();
      await expect(campaign.connect(creator).requestMilestoneRelease(0))
        .to.emit(campaign, "MilestoneReleaseRequested");

      const m = await campaign.getMilestone(0);
      expect(m.state).to.equal(1); // VOTING
      expect(m.votingDeadline).to.be.gt(0);
    });

    it("Should revert if called by non-creator", async function () {
      const { campaign, backer1 } = await successfulCampaign();
      await expect(campaign.connect(backer1).requestMilestoneRelease(0)).to.be.revertedWith(
        "Campaign: caller is not creator"
      );
    });

    it("Should revert if campaign not SUCCESSFUL", async function () {
      const { campaign, creator } = await deployAndCreateCampaign();
      await expect(campaign.connect(creator).requestMilestoneRelease(0)).to.be.revertedWith(
        "Campaign: not in SUCCESSFUL state"
      );
    });

    it("Should revert if previous milestone not approved", async function () {
      const { campaign, creator } = await successfulCampaign();
      await expect(campaign.connect(creator).requestMilestoneRelease(1)).to.be.revertedWith(
        "Campaign: previous milestone not approved"
      );
    });
  });

  // ─────────────────────────────────────────────
  // Voting
  // ─────────────────────────────────────────────
  describe("voteOnMilestone()", function () {
    async function votingCampaign() {
      const ctx = await deployAndCreateCampaign();
      await ctx.campaign.connect(ctx.backer1).contribute({ value: ethers.parseEther("6") });
      await ctx.campaign.connect(ctx.backer2).contribute({ value: ethers.parseEther("4") });
      await time.increaseTo(ctx.deadline + 1);
      await ctx.campaign.finalizeCampaign();
      await ctx.campaign.connect(ctx.creator).requestMilestoneRelease(0);
      return ctx;
    }

    it("Should record weighted vote", async function () {
      const { campaign, backer1 } = await votingCampaign();
      await campaign.connect(backer1).voteOnMilestone(0, true);
      const m = await campaign.getMilestone(0);
      expect(m.yesVotes).to.equal(ethers.parseEther("6"));
    });

    it("Should emit VoteCast event", async function () {
      const { campaign, backer1 } = await votingCampaign();
      await expect(campaign.connect(backer1).voteOnMilestone(0, true))
        .to.emit(campaign, "VoteCast")
        .withArgs(0, backer1.address, true, ethers.parseEther("6"));
    });

    it("Should revert if backer votes twice", async function () {
      const { campaign, backer1 } = await votingCampaign();
      await campaign.connect(backer1).voteOnMilestone(0, true);
      await expect(campaign.connect(backer1).voteOnMilestone(0, true)).to.be.revertedWith(
        "Campaign: already voted"
      );
    });

    it("Should revert if non-backer votes", async function () {
      const { campaign, backer3 } = await votingCampaign();
      await expect(campaign.connect(backer3).voteOnMilestone(0, true)).to.be.revertedWith(
        "Campaign: caller is not a backer"
      );
    });
  });

  // ─────────────────────────────────────────────
  // Vote finalization
  // ─────────────────────────────────────────────
  describe("finalizeVote()", function () {
    async function setupVoting(yesAmount: bigint, noAmount: bigint) {
      const ctx = await deployAndCreateCampaign();
      await ctx.campaign.connect(ctx.backer1).contribute({ value: yesAmount });
      if (noAmount > 0n) {
        await ctx.campaign.connect(ctx.backer2).contribute({ value: noAmount });
      }
      await time.increaseTo(ctx.deadline + 1);
      await ctx.campaign.finalizeCampaign();
      await ctx.campaign.connect(ctx.creator).requestMilestoneRelease(0);
      return ctx;
    }

    it("Should APPROVE milestone when yes > no with quorum", async function () {
      const { campaign, backer1, backer2 } = await setupVoting(
        ethers.parseEther("7"),
        ethers.parseEther("3")
      );
      await campaign.connect(backer1).voteOnMilestone(0, true);
      await campaign.connect(backer2).voteOnMilestone(0, false);

      // Advance past voting deadline (7 days)
      await time.increase(7 * 24 * 3600 + 1);
      await expect(campaign.finalizeVote(0))
        .to.emit(campaign, "MilestoneFinalized")
        .withArgs(0, 2, ethers.parseEther("3")); // 2=APPROVED, 30% of 10 ETH = 3 ETH

      const m = await campaign.getMilestone(0);
      expect(m.state).to.equal(2); // APPROVED
    });

    it("Should REJECT milestone when no >= yes", async function () {
      const { campaign, backer1, backer2 } = await setupVoting(
        ethers.parseEther("4"),
        ethers.parseEther("6")
      );
      await campaign.connect(backer1).voteOnMilestone(0, true);
      await campaign.connect(backer2).voteOnMilestone(0, false);

      await time.increase(7 * 24 * 3600 + 1);
      await campaign.finalizeVote(0);

      const m = await campaign.getMilestone(0);
      expect(m.state).to.equal(3); // REJECTED
    });

    it("Should REJECT when quorum not met", async function () {
      // Total = 10 ETH, 10% quorum = 1 ETH. Only 0.5 ETH voted.
      const { campaign, backer1, backer2 } = await setupVoting(
        ethers.parseEther("9.5"),
        ethers.parseEther("0.5")
      );
      // Only backer2 votes (0.5 ETH), below 10% of 10 ETH = 1 ETH quorum
      await campaign.connect(backer2).voteOnMilestone(0, true);

      await time.increase(7 * 24 * 3600 + 1);
      await campaign.finalizeVote(0);

      const m = await campaign.getMilestone(0);
      expect(m.state).to.equal(3); // REJECTED (quorum not met)
    });

    it("Should revert if voting not ended", async function () {
      const { campaign, backer1 } = await setupVoting(
        ethers.parseEther("10"),
        ethers.parseEther("0")
      );
      await campaign.connect(backer1).voteOnMilestone(0, true);
      await expect(campaign.finalizeVote(0)).to.be.revertedWith("Campaign: voting not ended");
    });

    it("Should transfer creator funds after APPROVED milestone", async function () {
      const { campaign, creator, backer1 } = await setupVoting(
        ethers.parseEther("10"),
        ethers.parseEther("0")
      );
      await campaign.connect(backer1).voteOnMilestone(0, true);
      await time.increase(7 * 24 * 3600 + 1);

      const creatorBefore = await ethers.provider.getBalance(creator.address);
      await campaign.finalizeVote(0);
      const creatorAfter = await ethers.provider.getBalance(creator.address);

      // 30% of 10 ETH = 3 ETH, minus 2.5% fee = 2.925 ETH
      const expected = ethers.parseEther("2.925");
      expect(creatorAfter - creatorBefore).to.be.closeTo(expected, ethers.parseEther("0.001"));
    });
  });

  // ─────────────────────────────────────────────
  // Refunds
  // ─────────────────────────────────────────────
  describe("claimRefund()", function () {
    it("Should allow refund after campaign FAILED", async function () {
      const { campaign, backer1, deadline } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("5") });
      await time.increaseTo(deadline + 1);
      await campaign.finalizeCampaign();

      const before = await ethers.provider.getBalance(backer1.address);
      const tx = await campaign.connect(backer1).claimRefund();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * tx.gasPrice!;
      const after = await ethers.provider.getBalance(backer1.address);

      expect(after + gasUsed - before).to.be.closeTo(
        ethers.parseEther("5"),
        ethers.parseEther("0.001")
      );
    });

    it("Should revert if no pending refund", async function () {
      const { campaign, backer1 } = await deployAndCreateCampaign();
      await expect(campaign.connect(backer1).claimRefund()).to.be.revertedWith(
        "Campaign: no pending refund"
      );
    });

    it("Should prevent double refund", async function () {
      const { campaign, backer1, deadline } = await deployAndCreateCampaign();
      await campaign.connect(backer1).contribute({ value: ethers.parseEther("5") });
      await time.increaseTo(deadline + 1);
      await campaign.finalizeCampaign();
      await campaign.connect(backer1).claimRefund();
      await expect(campaign.connect(backer1).claimRefund()).to.be.revertedWith(
        "Campaign: no pending refund"
      );
    });
  });
});
