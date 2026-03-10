import { ethers } from "hardhat";

/**
 * Deploy to Sepolia:
 *   npx hardhat run scripts/deploy.ts --network sepolia
 */
async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH\n"
  );

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

  // Demo campaign: deadline 10 minutes from now, voting 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + 10 * 60;        // 10 minutes
  const votingDuration = 5 * 60;         // 5 minutes (in seconds)
  const goalAmount = ethers.parseEther("0.01");

  console.log("\n=== Creating Demo Campaign ===");
  const tx = await factory.createCampaign(
    "Demo Campaign",
    "QmExampleIPFSHash",
    goalAmount,
    deadline,
    votingDuration,
    ["Phase 1: Research", "Phase 2: Development", "Phase 3: Launch"],
    [3000, 4000, 3000]
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

  console.log("\n=== Next Step ===");
  console.log("Copy these addresses into frontend/.env:");
  console.log(`VITE_FACTORY_ADDRESS=${factoryAddr}`);
  console.log(`VITE_NFT_ADDRESS=${nftAddr}`);
  console.log(`VITE_TOKEN_ADDRESS=${tokenAddr}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
