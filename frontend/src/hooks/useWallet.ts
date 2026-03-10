import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { NETWORK_ID } from "../contracts/addresses";

export interface WalletState {
  address: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  chainId: number | null;
  isConnecting: boolean;
  isWrongNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const isWrongNetwork = chainId !== null && chainId !== NETWORK_ID;

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("請安裝 MetaMask！");
      return;
    }
    setIsConnecting(true);
    try {
      const _provider = new ethers.BrowserProvider(window.ethereum);
      await _provider.send("eth_requestAccounts", []);
      const _signer = await _provider.getSigner();
      const _address = await _signer.getAddress();
      const network = await _provider.getNetwork();

      setProvider(_provider);
      setSigner(_signer);
      setAddress(_address);
      setChainId(Number(network.chainId));
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
  }, []);

  // Auto-reconnect if already authorized
  useEffect(() => {
    const tryReconnect = async () => {
      if (!window.ethereum) return;
      const _provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await _provider.send("eth_accounts", []);
      if (accounts.length > 0) {
        const _signer = await _provider.getSigner();
        const _address = await _signer.getAddress();
        const network = await _provider.getNetwork();
        setProvider(_provider);
        setSigner(_signer);
        setAddress(_address);
        setChainId(Number(network.chainId));
      }
    };
    tryReconnect();
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) disconnect();
      else setAddress(accounts[0]);
    };
    const handleChainChanged = () => window.location.reload();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [disconnect]);

  return { address, provider, signer, chainId, isConnecting, isWrongNetwork, connect, disconnect };
}
