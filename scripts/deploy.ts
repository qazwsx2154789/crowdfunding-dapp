import { ethers } from "hardhat";

/**
 * Deployment script for the Crowdfunding Platform
 *
 * Run: npx hardhat run scripts/deploy.ts --network localhost
 */
async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH\n"
  );

  // Deploy CrowdfundingFactory (deploys BackerNFT + CrowdToken internally)
  console.log("Deploying CrowdfundingFactory...");
  const Factory = await ethers.getContractFactory("CrowdfundingFactory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();

  const factoryAddr = await factory.getAddress();
  const nftAddr = await factory.getBackerNFTAddress();
  const tokenAddr = await factory.getCrowdTokenAddress();

  console.log("\n=== Deployment Complete ===");
  console.log("CrowdfundingFactory:", factoryAddr);
  console.log("BackerNFT:          ", nftAddr);
  console.log("CrowdToken:         ", tokenAddr);
  console.log(
    "Platform fee:       ",
    (await factory.getPlatformFee()).toString(),
    "BPS (2.5%)"
  );

  // Example: create a demo campaign
  console.log("\n=== Creating Demo Campaign ===");

  const now = Math.floor(Date.now() / 1000);
  const oneMonth = now + 30 * 24 * 60 * 60;
  const goalAmount = ethers.parseEther("10"); // 10 ETH goal

  const tx = await factory.createCampaign(
    "Demo Campaign",
    "QmExampleIPFSHash",
    goalAmount,
    oneMonth,
    ["Phase 1: Research", "Phase 2: Development", "Phase 3: Launch"],
    [3000, 4000, 3000], // BPS: 30%, 40%, 30%
    [ethers.parseEther("1"), ethers.parseEther("0.1"), 0n], // NFT tiers: Gold≥1ETH, Silver≥0.1ETH, Bronze≥0
    [2, 1, 0] // 2=Gold, 1=Silver, 0=Bronze
  );

  const receipt = await tx.wait();
  const event = receipt!.logs.find((log) => {
    try {
      return factory.interface.parseLog(log as Parameters<typeof factory.interface.parseLog>[0])?.name === "CampaignCreated";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = factory.interface.parseLog(event as Parameters<typeof factory.interface.parseLog>[0]);
    console.log("Demo Campaign address:", parsed!.args.campaignAddress);
  }

  console.log("\nDeployment complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
