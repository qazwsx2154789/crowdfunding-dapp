// 部署合約後，將地址填入 frontend/.env，這裡自動讀取
export const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || "";
export const NFT_ADDRESS = import.meta.env.VITE_NFT_ADDRESS || "";
export const TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS || "";
export const NETWORK_ID = Number(import.meta.env.VITE_NETWORK_ID || "11155111");
export const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY || "";
export const SEPOLIA_RPC = ALCHEMY_API_KEY
  ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
  : "https://ethereum-sepolia-rpc.publicnode.com";
