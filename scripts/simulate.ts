import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const FACTORY_ADDR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  const [creator] = await ethers.getSigners();
  const backer1 = await ethers.getSigner("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  const backer2 = await ethers.getSigner("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
  const backer3 = await ethers.getSigner("0x90F79bf6EB2c4f870365E785982E1f101E93b906");

  const factory = await ethers.getContractAt("CrowdfundingFactory", FACTORY_ADDR);

  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const deadline = now + 3600; // 1 小時後截止
  const goal = ethers.parseEther("10");
  const nftThresholds = [ethers.parseEther("1"), ethers.parseEther("0.1"), 0n];
  const nftTiers = [2, 1, 0];

  console.log("\n=== 建立兩個募款活動 ===");

  // 建立 TestProject1
  let tx = await factory.connect(creator).createCampaign(
    "TestProject1", "", goal, deadline,
    ["Phase1", "Phase2", "Phase3"], [3000, 4000, 3000],
    nftThresholds, nftTiers
  );
  let receipt = await tx.wait();
  const addr1 = getAddr(factory, receipt!);
  console.log("TestProject1:", addr1);

  // 建立 TestProject2
  tx = await factory.connect(creator).createCampaign(
    "TestProject2", "", goal, deadline,
    ["Alpha", "Beta", "Launch"], [5000, 3000, 2000],
    nftThresholds, nftTiers
  );
  receipt = await tx.wait();
  const addr2 = getAddr(factory, receipt!);
  console.log("TestProject2:", addr2);

  const c1 = await ethers.getContractAt("Campaign", addr1);
  const c2 = await ethers.getContractAt("Campaign", addr2);

  console.log("\n=== 三位支持者各自贊助兩個活動 ===");
  for (const [project, c] of [["TestProject1", c1], ["TestProject2", c2]] as const) {
    await c.connect(backer1).contribute({ value: ethers.parseEther("9") });
    await c.connect(backer2).contribute({ value: ethers.parseEther("0.99") });
    await c.connect(backer3).contribute({ value: ethers.parseEther("0.01") });
    const info = await c.getCampaignInfo();
    console.log(`${project} 已籌: ${ethers.formatEther(info[3])} ETH / 10 ETH`);
  }

  console.log("\n=== 時間快轉（超過截止日）===");
  await time.increase(3700);

  console.log("\n=== 確認活動成功（finalizeCampaign）===");
  await c1.finalizeCampaign();
  await c2.finalizeCampaign();
  console.log("兩個活動狀態都設為 SUCCESSFUL ✓");

  // 現在展示完整里程碑流程（以 TestProject1 為例）
  console.log("\n======================================");
  console.log("=== TestProject1 完整收款流程示範 ===");
  console.log("======================================");

  const creatorBalBefore = await ethers.provider.getBalance(creator.address);
  console.log(`\n發起人餘額（收款前）: ${ethers.formatEther(creatorBalBefore)} ETH`);

  // 里程碑 0 (30% = 3 ETH)
  console.log("\n--- 里程碑 #1：Phase1 (30%) ---");
  await c1.connect(creator).requestMilestoneRelease(0);
  console.log("發起人發起里程碑投票 ✓");

  // 三位支持者都投贊成
  await c1.connect(backer1).voteOnMilestone(0, true);
  await c1.connect(backer2).voteOnMilestone(0, true);
  await c1.connect(backer3).voteOnMilestone(0, true);
  console.log("三位支持者投票贊成 ✓");

  // 快轉 7 天讓投票截止
  await time.increase(7 * 24 * 60 * 60 + 10);
  await c1.finalizeVote(0);
  const m0 = await c1.getMilestone(0);
  console.log(`里程碑 #1 結果: ${["PENDING","VOTING","APPROVED","REJECTED"][m0.state]}`);
  console.log(`資金已自動轉帳給發起人: ${ethers.formatEther((ethers.parseEther("10") * 3000n) / 10000n * 9750n / 10000n)} ETH（扣 2.5% 手續費）`);

  // 里程碑 1 (40% = 4 ETH)
  console.log("\n--- 里程碑 #2：Phase2 (40%) ---");
  await c1.connect(creator).requestMilestoneRelease(1);
  await c1.connect(backer1).voteOnMilestone(1, true);
  await c1.connect(backer2).voteOnMilestone(1, true);
  await time.increase(7 * 24 * 60 * 60 + 10);
  await c1.finalizeVote(1);
  const m1 = await c1.getMilestone(1);
  console.log(`里程碑 #2 結果: ${["PENDING","VOTING","APPROVED","REJECTED"][m1.state]}`);

  // 里程碑 2 (30% = 3 ETH)
  console.log("\n--- 里程碑 #3：Phase3 (30%) ---");
  await c1.connect(creator).requestMilestoneRelease(2);
  await c1.connect(backer1).voteOnMilestone(2, true);
  await time.increase(7 * 24 * 60 * 60 + 10);
  await c1.finalizeVote(2);
  const m2 = await c1.getMilestone(2);
  console.log(`里程碑 #3 結果: ${["PENDING","VOTING","APPROVED","REJECTED"][m2.state]}`);

  const creatorBalAfter = await ethers.provider.getBalance(creator.address);
  const received = creatorBalAfter - creatorBalBefore;
  const info1 = await c1.getCampaignInfo();

  console.log("\n======================================");
  console.log(`發起人實際收到: ~${ethers.formatEther(received)} ETH`);
  console.log(`（10 ETH × 97.5% = 9.75 ETH，扣除 Gas 費）`);
  console.log(`TestProject1 最終狀態: ${["ACTIVE","SUCCESSFUL","COMPLETED","FAILED"][info1[5]]}`);
  console.log("======================================");

  // 同樣流程套用到 TestProject2
  console.log("\n=== TestProject2 同樣流程（快速版）===");
  for (let i = 0; i < 3; i++) {
    await c2.connect(creator).requestMilestoneRelease(i);
    await c2.connect(backer1).voteOnMilestone(i, true);
    await time.increase(7 * 24 * 60 * 60 + 10);
    await c2.finalizeVote(i);
  }
  const info2 = await c2.getCampaignInfo();
  console.log(`TestProject2 最終狀態: ${["ACTIVE","SUCCESSFUL","COMPLETED","FAILED"][info2[5]]}`);
  console.log("\n✅ 兩個活動全部完成！");
}

function getAddr(factory: any, receipt: any): string {
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === "CampaignCreated") return parsed.args.campaignAddress;
    } catch {}
  }
  throw new Error("CampaignCreated event not found");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
