import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { FACTORY_ABI, CAMPAIGN_ABI } from "../contracts/abis";
import { FACTORY_ADDRESS, SEPOLIA_RPC } from "../contracts/addresses";
import { getEthUsdPrice, ethToUsd } from "../utils/chainlink";
import { ipfsToHttp } from "../utils/ipfs";

const STATE_LABELS = ["募資中", "達標", "已完成", "已失敗"];
const STATE_BADGES = ["badge-active", "badge-success", "badge-completed", "badge-failed"];

interface CampaignSummary {
  address: string;
  title: string;
  ipfsHash: string;
  goalAmount: bigint;
  totalRaised: bigint;
  deadline: bigint;
  state: number;
  milestoneCount: bigint;
}

export default function Home() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [ethPrice, setEthPrice] = useState(0);
  const [filter, setFilter] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [price] = await Promise.all([getEthUsdPrice()]);
      setEthPrice(price);

      if (!FACTORY_ADDRESS) { setLoading(false); return; }
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
      const addrs: string[] = await factory.getCampaigns();

      const results = await Promise.all(
        addrs.map(async (addr) => {
          const c = new ethers.Contract(addr, CAMPAIGN_ABI, provider);
          const info = await c.getCampaignInfo();
          return {
            address: addr,
            title: info._title,
            ipfsHash: info._ipfsHash,
            goalAmount: info._goalAmount,
            totalRaised: info._totalRaised,
            deadline: info._deadline,
            state: Number(info._state),
            milestoneCount: info._milestoneCount,
          };
        })
      );
      setCampaigns(results.reverse());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === null ? campaigns : campaigns.filter((c) => c.state === filter);

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-dark-700 via-brand/20 to-dark-700 border border-dark-500 p-8 mb-8">
        <div className="absolute inset-0 bg-gradient-to-r from-brand/10 to-accent/10 pointer-events-none" />
        <div className="relative">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-3">
            去中心化眾籌平台
          </h1>
          <p className="text-slate-300 text-lg mb-6 max-w-2xl">
            透過智慧合約直接支持創作者。里程碑制度保障資金安全，每位贊助者皆獲得專屬 NFT。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/create" className="btn-primary">
              + 發起募資活動
            </Link>
            <div className="flex items-center gap-2 bg-dark-700/80 border border-dark-500 rounded-xl px-4 py-2.5">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse-slow" />
              <span className="text-slate-300 text-sm">ETH/USD</span>
              <span className="text-white font-bold">
                {ethPrice > 0 ? ethToUsd(1, ethPrice) : "載入中..."}
              </span>
              <span className="text-xs text-slate-500">via Chainlink</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "總募資活動", value: campaigns.length },
          { label: "募資中", value: campaigns.filter((c) => c.state === 0).length },
          { label: "成功達標", value: campaigns.filter((c) => c.state >= 1).length },
          {
            label: "總募資金額",
            value: ethToUsd(
              Number(ethers.formatEther(campaigns.reduce((s, c) => s + c.totalRaised, 0n))),
              ethPrice
            ),
          },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-2xl font-bold text-white mb-1">{s.value}</div>
            <div className="text-slate-400 text-sm">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { label: "全部", value: null },
          { label: "募資中", value: 0 },
          { label: "達標", value: 1 },
          { label: "已完成", value: 2 },
          { label: "已失敗", value: 3 },
        ].map((f) => (
          <button
            key={String(f.value)}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === f.value
                ? "bg-brand text-white"
                : "bg-dark-600 text-slate-300 hover:bg-dark-500"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Campaign grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-40 bg-dark-500 rounded-xl mb-4" />
              <div className="h-5 bg-dark-500 rounded w-3/4 mb-2" />
              <div className="h-4 bg-dark-500 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : !FACTORY_ADDRESS ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🚀</div>
          <h3 className="text-xl font-bold text-white mb-2">合約尚未部署</h3>
          <p className="text-slate-400">請先部署合約並填入 .env 中的合約地址</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-xl font-bold text-white mb-2">目前沒有活動</h3>
          <p className="text-slate-400 mb-6">成為第一個發起募資的人！</p>
          <Link to="/create" className="btn-primary inline-flex">發起募資活動</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((c) => (
            <CampaignCard key={c.address} campaign={c} ethPrice={ethPrice} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ campaign: c, ethPrice }: { campaign: CampaignSummary; ethPrice: number }) {
  const progress = c.goalAmount > 0n
    ? Math.min(100, Number((c.totalRaised * 100n) / c.goalAmount))
    : 0;
  const deadline = new Date(Number(c.deadline) * 1000);
  const isExpired = Date.now() > Number(c.deadline) * 1000;
  const goalEth = Number(ethers.formatEther(c.goalAmount));
  const raisedEth = Number(ethers.formatEther(c.totalRaised));

  const timeLeft = () => {
    if (isExpired) return "已截止";
    const diff = Number(c.deadline) * 1000 - Date.now();
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days} 天 ${hrs} 小時`;
    if (hrs > 0) return `${hrs} 小時 ${mins} 分`;
    return `${mins} 分鐘`;
  };

  return (
    <Link to={`/campaign/${c.address}`} className="card-hover flex flex-col">
      {/* Image */}
      <div className="h-36 rounded-xl mb-4 overflow-hidden bg-dark-500 flex items-center justify-center">
        {c.ipfsHash && c.ipfsHash !== "QmExampleIPFSHash" ? (
          <img
            src={ipfsToHttp(c.ipfsHash)}
            alt={c.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="text-4xl opacity-30">🏗</div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-display font-bold text-white text-lg leading-tight line-clamp-2">
            {c.title}
          </h3>
          <span className={STATE_BADGES[c.state]}>{STATE_LABELS[c.state]}</span>
        </div>

        {/* Progress */}
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-slate-300 font-medium">{raisedEth.toFixed(4)} ETH</span>
            <span className="text-slate-500">目標 {goalEth} ETH</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill bg-gradient-to-r from-brand to-accent"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-brand font-semibold">{progress}%</span>
            <span className="text-slate-500">{ethToUsd(raisedEth, ethPrice)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-dark-500 mt-auto">
          <span>⏱ {timeLeft()}</span>
          <span>
            {deadline.toLocaleDateString("zh-TW")} {deadline.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </Link>
  );
}
