import { ethers } from "ethers";
import { CHAINLINK_ABI, CHAINLINK_ETH_USD_SEPOLIA } from "../contracts/abis";
import { SEPOLIA_RPC } from "../contracts/addresses";

let cachedPrice: number | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

async function fetchFromChainlink(): Promise<number> {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const feed = new ethers.Contract(CHAINLINK_ETH_USD_SEPOLIA, CHAINLINK_ABI, provider);
  const [, answer] = await feed.latestRoundData();
  const decimals: number = await feed.decimals();
  return Number(answer) / 10 ** decimals;
}

async function fetchFromCoinGecko(): Promise<number> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
  );
  const data = await res.json();
  return data.ethereum.usd;
}

export async function getEthUsdPrice(): Promise<number> {
  if (cachedPrice && Date.now() - cacheTime < CACHE_TTL) return cachedPrice;

  try {
    const price = await Promise.race([
      fetchFromChainlink(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    cachedPrice = price;
    cacheTime = Date.now();
    return price;
  } catch {
    // Chainlink failed or timed out, try CoinGecko
    try {
      const price = await fetchFromCoinGecko();
      cachedPrice = price;
      cacheTime = Date.now();
      return price;
    } catch {
      return cachedPrice ?? 0;
    }
  }
}

export function ethToUsd(ethAmount: number, price: number): string {
  if (!price) return "—";
  return (ethAmount * price).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
