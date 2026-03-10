import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { WalletContext } from "../App";
import { FACTORY_ABI, CAMPAIGN_ABI, BACKER_NFT_ABI, CROWD_TOKEN_ABI } from "../contracts/abis";
import { FACTORY_ADDRESS, NFT_ADDRESS, TOKEN_ADDRESS, SEPOLIA_RPC } from "../contracts/addresses";
import { getEthUsdPrice } from "../utils/chainlink";

const TIER_COLORS = ["text-bronze", "text-silver", "text-gold"];
const TIER_LABELS = ["Bronze", "Silver", "Gold"];
const TIER_ICONS = ["🥉", "🥈", "🥇"];
const STATE_LABELS = ["募資中", "達標", "已完成", "已失敗"];
const STATE_BADGES = ["badge-active", "badge-success", "badge-completed", "badge-failed"];

interface NFT {
  tokenId: number;
  campaign: string;
  tier: number;
  contributionAmount: bigint;
  mintedAt: bigint;
  campaignTitle?: string;
}

interface MyCampaign {
  address: string;
  title: string;
  totalRaised: bigint;
  goalAmount: bigint;
  state: number;
}

interface MyContrib {
  address: string;
  title: string;
  amount: bigint;
  state: number;
  pendingRefund: bigint;
}

export default function MyAccount() {
  const wallet = useContext(WalletContext)!;
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [myCampaigns, setMyCampaigns] = useState<MyCampaign[]>([]);
  const [myContribs, setMyContribs] = useState<MyContrib[]>([]);
  const [crowdBalance, setCrowdBalance] = useState(0n);
  const [ethPrice, setEthPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"nfts" | "campaigns" | "contributions">("nfts");

  useEffect(() => {
    if (!wallet.address) { setLoading(false); return; }
    loadData();
  }, [wallet.address]);

  async function loadData() {
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
      const price = await getEthUsdPrice();
      setEthPrice(price);

      // CROWD token balance
      if (TOKEN_ADDRESS) {
        const token = new ethers.Contract(TOKEN_ADDRESS, CROWD_TOKEN_ABI, provider);
        setCrowdBalance(await token.balanceOf(wallet.address!));
      }

      if (!FACTORY_ADDRESS) { setLoading(false); return; }
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

      // My campaigns
      const creatorAddrs: string[] = await factory.getCampaignsByCreator(wallet.address!);
      const myC = await Promise.all(creatorAddrs.map(async (addr) => {
        const c = new ethers.Contract(addr, CAMPAIGN_ABI, provider);
        const info = await c.getCampaignInfo();
        return { address: addr, title: info._title, totalRaised: info._totalRaised, goalAmount: info._goalAmount, state: Number(info._state) };
      }));
      setMyCampaigns(myC.reverse());

      // My contributions (scan all campaigns)
      const allAddrs: string[] = await factory.getCampaigns();
      const contribs: MyContrib[] = [];
      await Promise.all(allAddrs.map(async (addr) => {
        const c = new ethers.Contract(addr, CAMPAIGN_ABI, provider);
        const [contrib, info, refund] = await Promise.all([
          c.contributions(wallet.address!),
          c.getCampaignInfo(),
          c.pendingRefunds(wallet.address!),
        ]);
        if (contrib.amount > 0n) {
          contribs.push({ address: addr, title: info._title, amount: contrib.amount, state: Number(info._state), pendingRefund: refund });
        }
      }));
      setMyContribs(contribs.sort((a, b) => (a.amount > b.amount ? -1 : 1)));

      // My NFTs (scan by NFTMinted events)
      if (NFT_ADDRESS) {
        const nftContract = new ethers.Contract(NFT_ADDRESS, BACKER_NFT_ABI, provider);
        const filter = nftContract.filters.NFTMinted(null, wallet.address!);
        const events = await nftContract.queryFilter(filter, -100000);
        const nftList: NFT[] = await Promise.all(
          events.map(async (e: any) => {
            const tokenId = Number(e.args.tokenId);
            const data = await nftContract.getNFTData(tokenId);
            let campaignTitle = "";
            try {
              const ctr = new ethers.Contract(data.campaign, CAMPAIGN_ABI, provider);
              const info = await ctr.getCampaignInfo();
              campaignTitle = info._title;
            } catch { /* skip */ }
            return {
              tokenId,
              campaign: data.campaign,
              tier: Number(data.tier),
              contributionAmount: data.contributionAmount,
              mintedAt: data.mintedAt,
              campaignTitle,
            };
          })
        );
        setNfts(nftList.sort((a, b) => b.tier - a.tier));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (!wallet.address) {
    return (
      <div className="card text-center py-20 animate-fade-in">
        <div className="text-5xl mb-4">🔗</div>
        <h2 className="text-2xl font-display font-bold text-white mb-2">尚未連接錢包</h2>
        <p className="text-slate-400 mb-6">連接 MetaMask 查看你的 NFT、活動和贊助記錄</p>
        <button onClick={wallet.connect} className="btn-primary">連接錢包</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-white mb-1">我的帳號</h1>
            <p className="font-mono text-slate-400 text-sm">{wallet.address}</p>
          </div>
          <div className="bg-dark-600 border border-brand/30 rounded-xl px-4 py-3 text-center">
            <div className="text-xl font-bold text-brand">
              {Number(ethers.formatUnits(crowdBalance, 18)).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400">CROWD Token</div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: "我的 NFT", value: nfts.length },
            { label: "發起的活動", value: myCampaigns.length },
            { label: "參與的活動", value: myContribs.length },
          ].map((s) => (
            <div key={s.label} className="bg-dark-600 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-white">{loading ? "—" : s.value}</div>
              <div className="text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["nfts", "campaigns", "contributions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab ? "bg-brand text-white" : "bg-dark-600 text-slate-300 hover:bg-dark-500"
            }`}
          >
            {{ nfts: `NFT (${nfts.length})`, campaigns: `我的活動 (${myCampaigns.length})`, contributions: `我的贊助 (${myContribs.length})` }[tab]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="card animate-pulse h-40" />)}
        </div>
      ) : (
        <>
          {/* NFTs */}
          {activeTab === "nfts" && (
            nfts.length === 0 ? (
              <div className="card text-center py-16">
                <div className="text-4xl mb-3">🎖</div>
                <p className="text-slate-400">還沒有 NFT。贊助活動後，活動結算時會自動發放。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {nfts.map((nft) => (
                  <div key={nft.tokenId} className={`card border ${nft.tier === 2 ? "border-gold/40" : nft.tier === 1 ? "border-silver/40" : "border-bronze/40"}`}>
                    <div className={`text-5xl text-center mb-3 ${TIER_COLORS[nft.tier]}`}>
                      {TIER_ICONS[nft.tier]}
                    </div>
                    <div className="text-center">
                      <p className={`font-display font-bold text-lg ${TIER_COLORS[nft.tier]}`}>
                        {TIER_LABELS[nft.tier]} Backer
                      </p>
                      <p className="text-slate-400 text-xs mt-1">#{nft.tokenId}</p>
                      {nft.campaignTitle && (
                        <p className="text-slate-300 text-sm mt-2 truncate">{nft.campaignTitle}</p>
                      )}
                      <p className="text-slate-500 text-xs mt-1">
                        貢獻 {Number(ethers.formatEther(nft.contributionAmount)).toFixed(4)} ETH
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* My Campaigns */}
          {activeTab === "campaigns" && (
            myCampaigns.length === 0 ? (
              <div className="card text-center py-16">
                <div className="text-4xl mb-3">🚀</div>
                <p className="text-slate-400 mb-4">還沒有發起過活動</p>
                <Link to="/create" className="btn-primary inline-flex">發起募資活動</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {myCampaigns.map((c) => {
                  const prog = c.goalAmount > 0n ? Math.min(100, Number((c.totalRaised * 100n) / c.goalAmount)) : 0;
                  return (
                    <Link key={c.address} to={`/campaign/${c.address}`} className="card-hover flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white truncate">{c.title}</p>
                        <p className="text-slate-500 text-xs font-mono">{c.address.slice(0, 10)}...</p>
                        <div className="progress-bar mt-2">
                          <div className="progress-fill bg-gradient-to-r from-brand to-accent" style={{ width: `${prog}%` }} />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={STATE_BADGES[c.state]}>{STATE_LABELS[c.state]}</span>
                        <p className="text-white text-sm font-medium mt-1">
                          {Number(ethers.formatEther(c.totalRaised)).toFixed(4)} ETH
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )
          )}

          {/* My Contributions */}
          {activeTab === "contributions" && (
            myContribs.length === 0 ? (
              <div className="card text-center py-16">
                <div className="text-4xl mb-3">💰</div>
                <p className="text-slate-400 mb-4">還沒有贊助過任何活動</p>
                <Link to="/" className="btn-primary inline-flex">探索活動</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {myContribs.map((c) => (
                  <Link key={c.address} to={`/campaign/${c.address}`} className="card-hover flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate">{c.title}</p>
                      <p className="text-slate-500 text-xs font-mono">{c.address.slice(0, 10)}...</p>
                      {c.pendingRefund > 0n && (
                        <p className="text-red-400 text-xs mt-1">
                          可退款: {Number(ethers.formatEther(c.pendingRefund)).toFixed(4)} ETH
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={STATE_BADGES[c.state]}>{STATE_LABELS[c.state]}</span>
                      <p className="text-white text-sm font-medium mt-1">
                        {Number(ethers.formatEther(c.amount)).toFixed(4)} ETH
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
