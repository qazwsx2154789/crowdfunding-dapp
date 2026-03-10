import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * CrowdfundingPlatform Ignition deployment module
 *
 * Deploys:
 *   1. CrowdfundingFactory (which internally deploys BackerNFT + CrowdToken)
 *
 * Usage:
 *   npx hardhat ignition deploy ./ignition/modules/CrowdfundingPlatform.ts --network localhost
 */
export default buildModule("CrowdfundingPlatform", (m) => {
  // The deployer account becomes the factory owner
  const deployer = m.getAccount(0);

  const factory = m.contract("CrowdfundingFactory", [deployer]);

  return { factory };
});
