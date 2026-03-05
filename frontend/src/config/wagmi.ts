import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";

export const hardhatLocalnet = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

const connectors = connectorsForWallets(
  [{ groupName: "Recommended", wallets: [metaMaskWallet] }],
  { appName: "Crowdfunding Platform", projectId: "local_dev" }
);

export const wagmiConfig = createConfig({
  chains: [hardhatLocalnet],
  connectors,
  transports: { [hardhatLocalnet.id]: http("http://127.0.0.1:8545") },
});
