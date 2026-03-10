import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const FACTORY = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  const [creator] = await ethers.getSigners();
  const b1 = await ethers.getSigner("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  const b2 = await ethers.getSigner("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
  const b3 = await ethers.getSigner("0x90F79bf6EB2c4f870365E785982E1f101E93b906");

  const factory = await ethers.getContractAt("CrowdfundingFactory", FACTORY);
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const deadline = now + 7200;
  const goal = ethers.parseEther("10");
  const nftT = [ethers.parseEther("1"), ethers.parseEther("0.1"), 0n];
  const nftV = [2, 1, 0];

  console.log("發起人:", creator.address);

  // ── TestProject1：會成功 ──
  let tx = await factory.connect(creator).createCampaign(
    "TestProject1", "", goal, deadline,
    ["Phase1 設計", "Phase2 開發", "Phase3 上線"], [3000, 4000, 3000],
    nftT, nftV
  );
  const r1 = await tx.wait();
  const addr1 = getAddr(factory, r1!);
  console.log("\nTestProject1:", addr1);

  const c1 = await ethers.getContractAt("Campaign", addr1);
  await c1.connect(b1).contribute({ value: ethers.parseEther("9") });
  await c1.connect(b2).contribute({ value: ethers.parseEther("0.99") });
  await c1.connect(b3).contribute({ value: ethers.parseEther("0.01") });
  console.log("  已贊助 9 + 0.99 + 0.01 = 10 ETH ✓");

  // ── TestProject2：會失敗（只籌到 5 ETH）──
  tx = await factory.connect(creator).createCampaign(
    "TestProject2", "", goal, deadline,
    ["Alpha 開發", "Beta 測試", "正式上線"], [5000, 3000, 2000],
    nftT, nftV
  );
  const r2 = await tx.wait();
  const addr2 = getAddr(factory, r2!);
  console.log("\nTestProject2:", addr2);

  const c2 = await ethers.getContractAt("Campaign", addr2);
  await c2.connect(b1).contribute({ value: ethers.parseEther("4") });
  await c2.connect(b2).contribute({ value: ethers.parseEther("1") });
  console.log("  只贊助 4 + 1 = 5 ETH（未達目標）");

  // ── 快轉時間，讓截止日到期 ──
  console.log("\n⏩ 快轉時間（超過截止日）...");
  await time.increase(7300);

  // ── 結算兩個活動 ──
  await c1.finalizeCampaign();
  await c2.finalizeCampaign();

  const info1 = await c1.getCampaignInfo();
  const info2 = await c2.getCampaignInfo();
  const states = ["ACTIVE", "SUCCESSFUL ✓", "COMPLETED", "FAILED ✗"];
  console.log("\n=== 結果 ===");
  console.log("TestProject1:", states[info1[5]], "- 已籌:", ethers.formatEther(info1[3]), "ETH");
  console.log("TestProject2:", states[info2[5]], "- 已籌:", ethers.formatEther(info2[3]), "ETH");
  console.log("\n✅ 準備完成！");
  console.log("   - TestProject1 (SUCCESSFUL)：請連接發起人帳戶，自己點「啟動里程碑投票」");
  console.log("   - TestProject2 (FAILED)：支持者可點「申請退款」");
  console.log("\n前端地址: http://localhost:3000");
}

function getAddr(factory: any, receipt: any): string {
  for (const log of receipt.logs) {
    try {
      const p = factory.interface.parseLog(log);
      if (p?.name === "CampaignCreated") return p.args.campaignAddress;
    } catch {}
  }
  throw new Error("CampaignCreated not found");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
