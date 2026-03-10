import React, { useContext, useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";
import { WalletContext } from "../App";
import { CAMPAIGN_ABI } from "../contracts/abis";
import { SEPOLIA_RPC } from "../contracts/addresses";
import { getEthUsdPrice, ethToUsd } from "../utils/chainlink";
import { ipfsToHttp } from "../utils/ipfs";

const STATE_LABELS = ["募資中", "達標", "已完成", "已失敗"];
const STATE_BADGES = ["badge-active", "badge-success", "badge-completed", "badge-failed"];
const MS_LABELS = ["等待中", "投票中", "已通過", "已否決"];

interface CampaignInfo {
  title: string;
  ipfsHash: string;
  goalAmount: bigint;
  totalRaised: bigint;
  deadline: bigint;
  state: number;
  milestoneCount: bigint;
  votingDuration: bigint;
}

interface Milestone {
  description: string;
  fundingBPS: bigint;
  votingDeadline: bigint;
  state: number;
  yesVotes: bigint;
  noVotes: bigint;
  fundsReleased: boolean;
}

interface Backer {
  address: string;
  amount: bigint;
}

export default function CampaignDetail() {
  const { address } = useParams<{ address: string }>();
  const wallet = useContext(WalletContext)!;

  const [info, setInfo] = useState<CampaignInfo | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [backers, setBackers] = useState<Backer[]>([]);
  const [myContribution, setMyContribution] = useState(0n);
  const [myPendingRefund, setMyPendingRefund] = useState(0n);
  const [creator, setCreator] = useState("");
  const [ethPrice, setEthPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [txMsg, setTxMsg] = useState("");
  const [contributeEth, setContributeEth] = useState("0.01");
  const [countdown, setCountdown] = useState("");
  const [ipfsMeta, setIpfsMeta] = useState<{ description?: string; imageCid?: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!address) return;
    try {
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
      const campaign = new ethers.Contract(address, CAMPAIGN_ABI, provider);
      const [info, creatorAddr, price] = await Promise.all([
        campaign.getCampaignInfo(),
        campaign.creator(),
        getEthUsdPrice(),
      ]);
      setEthPrice(price);
      setCreator(creatorAddr);
      setInfo({
        title: info._title,
        ipfsHash: info._ipfsHash,
        goalAmount: info._goalAmount,
        totalRaised: info._totalRaised,
        deadline: info._deadline,
        state: Number(info._state),
        milestoneCount: info._milestoneCount,
        votingDuration: info._votingDuration,
      });

      // Load milestones
      const mCount = Number(info._milestoneCount);
      const ms = await Promise.all(
        Array.from({ length: mCount }, (_, i) => campaign.getMilestone(i))
      );
      setMilestones(ms.map((m) => ({
        description: m.description,
        fundingBPS: m.fundingBPS,
        votingDeadline: m.votingDeadline,
        state: Number(m.state),
        yesVotes: m.yesVotes,
        noVotes: m.noVotes,
        fundsReleased: m.fundsReleased,
      })));

      // Load backers
      const backerAddrs: string[] = await campaign.getBackers();
      const backerData = await Promise.all(
        backerAddrs.map(async (a) => {
          const c = await campaign.contributions(a);
          return { address: a, amount: c.amount };
        })
      );
      setBackers(backerData.sort((a, b) => (a.amount > b.amount ? -1 : 1)));

      // Load my data
      if (wallet.address) {
        const [myC, myR] = await Promise.all([
          campaign.contributions(wallet.address),
          campaign.pendingRefunds(wallet.address),
        ]);
        setMyContribution(myC.amount);
        setMyPendingRefund(myR);
      }

      // Load IPFS metadata
      try {
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${info._ipfsHash}`);
        if (res.ok) setIpfsMeta(await res.json());
      } catch { /* no metadata */ }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [address, wallet.address]);

  useEffect(() => { loadData(); }, [loadData]);

  // Countdown timer
  useEffect(() => {
    if (!info) return;
    const tick = () => {
      const now = Date.now();
      const end = Number(info.deadline) * 1000;
      if (now >= end) { setCountdown("已截止"); return; }
      const diff = end - now;
      const days = Math.floor(diff / 86400000);
      const hrs = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdown(days > 0 ? `${days}天 ${hrs}時 ${mins}分 ${secs}秒` : `${hrs}時 ${mins}分 ${secs}秒`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [info]);

  async function sendTx(fn: () => Promise<ethers.ContractTransactionResponse>, msg: string) {
    setTxLoading(true);
    setTxMsg(msg);
    try {
      const tx = await fn();
      setTxMsg("等待確認...");
      await tx.wait();
      setTxMsg("成功！");
      setTimeout(() => { setTxMsg(""); loadData(); }, 1500);
    } catch (e: any) {
      console.error(e);
      setTxMsg("");
      alert(e?.reason || e?.message || "交易失敗");
    } finally {
      setTxLoading(false);
    }
  }

  function getContract() {
    return new ethers.Contract(address!, CAMPAIGN_ABI, wallet.signer!);
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto">
      <div className="card animate-pulse h-64 mb-4" />
      <div className="grid grid-cols-2 gap-4">
        <div className="card animate-pulse h-40" />
        <div className="card animate-pulse h-40" />
      </div>
    </div>
  );

  if (!info) return (
    <div className="card text-center py-16">
      <p className="text-slate-400">找不到此募資活動</p>
    </div>
  );

  const progress = info.goalAmount > 0n
    ? Math.min(100, Number((info.totalRaised * 100n) / info.goalAmount))
    : 0;
  const goalEth = Number(ethers.formatEther(info.goalAmount));
  const raisedEth = Number(ethers.formatEther(info.totalRaised));
  const isCreator = wallet.address?.toLowerCase() === creator.toLowerCase();
  const isBacker = myContribution > 0n;
  const isActive = info.state === 0;
  const isPastDeadline = Date.now() > Number(info.deadline) * 1000;
  const deadline = new Date(Number(info.deadline) * 1000);

  return (
    <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
      {/* Header */}
      <div className="card">
        {ipfsMeta?.imageCid && (
          <div className="h-56 rounded-xl overflow-hidden mb-5 bg-dark-600">
            <img src={ipfsToHttp(ipfsMeta.imageCid)} alt={info.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-1">{info.title}</h1>
            <p className="text-slate-400 text-sm">
              發起人：<span className="font-mono text-slate-300">{creator.slice(0, 8)}...{creator.slice(-6)}</span>
            </p>
          </div>
          <span className={STATE_BADGES[info.state]}>{STATE_LABELS[info.state]}</span>
        </div>

        {ipfsMeta?.description && (
          <p className="text-slate-300 mb-4 leading-relaxed">{ipfsMeta.description}</p>
        )}

        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between mb-2">
            <span className="text-white font-bold text-xl">{raisedEth.toFixed(4)} ETH</span>
            <span className="text-slate-400">目標 {goalEth} ETH</span>
          </div>
          <div className="progress-bar h-3">
            <div
              className="progress-fill bg-gradient-to-r from-brand to-accent h-3"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-sm mt-1.5">
            <span className="text-brand font-bold">{progress}%</span>
            <span className="text-slate-500">{ethToUsd(raisedEth, ethPrice)}</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          {[
            { label: "贊助人數", value: backers.length },
            { label: "截止倒計時", value: countdown },
            { label: "截止時間", value: `${deadline.toLocaleDateString("zh-TW")} ${deadline.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}` },
            { label: "投票時長", value: `${Number(info.votingDuration) / 60} 分鐘` },
          ].map((s) => (
            <div key={s.label} className="bg-dark-600 rounded-xl p-3">
              <div className="font-bold text-white text-sm">{s.value}</div>
              <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {txMsg && (
        <div className="card bg-brand/10 border-brand/30 text-brand text-center font-medium">
          ⏳ {txMsg}
        </div>
      )}

      {/* Contribute */}
      {isActive && !isPastDeadline && wallet.address && (
        <div className="card">
          <h2 className="text-lg font-display font-bold text-white mb-4">💎 贊助此活動</h2>
          {isBacker && (
            <p className="text-sm text-slate-400 mb-3">
              你已贊助：<span className="text-white font-medium">{Number(ethers.formatEther(myContribution)).toFixed(4)} ETH</span>
            </p>
          )}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                className="input pr-14"
                type="number"
                step="0.001"
                min="0.001"
                value={contributeEth}
                onChange={(e) => setContributeEth(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">ETH</span>
            </div>
            <button
              className="btn-primary"
              disabled={txLoading || !contributeEth}
              onClick={() => sendTx(
                () => getContract().contribute({ value: ethers.parseEther(contributeEth) }),
                "贊助中..."
              )}
            >
              贊助
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            ≈ {ethToUsd(Number(contributeEth || 0), ethPrice)}　贊助後立即獲得 CROWD Token，NFT 於活動結束後發放
          </p>
        </div>
      )}

      {/* Finalize Campaign */}
      {isActive && isPastDeadline && (
        <div className="card border-yellow-500/30">
          <h2 className="text-lg font-display font-bold text-white mb-2">⏰ 募資期結束</h2>
          <p className="text-slate-400 text-sm mb-4">
            截止時間已到，可以結算活動狀態並發放 NFT。
          </p>
          <button
            className="btn-primary"
            disabled={txLoading || !wallet.address}
            onClick={() => sendTx(() => getContract().finalizeCampaign(), "結算中...")}
          >
            結算活動 / 發放 NFT
          </button>
        </div>
      )}

      {/* Refund */}
      {myPendingRefund > 0n && (
        <div className="card border-red-500/30">
          <h2 className="text-lg font-display font-bold text-white mb-2">💰 可退款</h2>
          <p className="text-slate-300 mb-4">
            你有 <span className="text-white font-bold">{Number(ethers.formatEther(myPendingRefund)).toFixed(6)} ETH</span> 可以退款
          </p>
          <button
            className="btn-outline border-red-500 text-red-400 hover:bg-red-500 hover:text-white"
            disabled={txLoading}
            onClick={() => sendTx(() => getContract().claimRefund(), "退款中...")}
          >
            領取退款
          </button>
        </div>
      )}

      {/* Milestones */}
      <div className="card">
        <h2 className="text-xl font-display font-bold text-white mb-4">🎯 里程碑</h2>
        <div className="space-y-4">
          {milestones.map((m, i) => {
            const totalVotes = m.yesVotes + m.noVotes;
            const yesPercent = totalVotes > 0n ? Number((m.yesVotes * 100n) / totalVotes) : 0;
            const voteEnd = Number(m.votingDeadline) * 1000;
            const votingActive = m.state === 1 && Date.now() < voteEnd;
            const canFinalize = m.state === 1 && Date.now() >= voteEnd;
            const msColors = ["text-slate-400", "text-yellow-400", "text-green-400", "text-red-400"];

            return (
              <div key={i} className="bg-dark-600 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-brand/20 text-brand text-sm font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-white font-medium">{m.description}</p>
                      <p className="text-slate-500 text-xs">{Number(m.fundingBPS) / 100}% 資金</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-sm font-medium ${msColors[m.state]}`}>
                      {MS_LABELS[m.state]}
                    </span>
                    {m.fundsReleased && <span className="text-xs text-green-400">已撥款</span>}
                  </div>
                </div>

                {/* Voting results */}
                {(m.state === 1 || m.state === 2 || m.state === 3) && totalVotes > 0n && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>贊成 {yesPercent}%</span>
                      <span>反對 {100 - yesPercent}%</span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-dark-500">
                      <div className="bg-green-500 h-full transition-all" style={{ width: `${yesPercent}%` }} />
                      <div className="bg-red-500 h-full transition-all" style={{ width: `${100 - yesPercent}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {Number(ethers.formatEther(m.yesVotes)).toFixed(4)} ETH 贊成 ／ {Number(ethers.formatEther(m.noVotes)).toFixed(4)} ETH 反對
                    </p>
                  </div>
                )}

                {/* Voting deadline */}
                {m.state === 1 && (
                  <p className="text-xs text-slate-500 mt-2">
                    投票截止：{new Date(voteEnd).toLocaleString("zh-TW")}
                  </p>
                )}

                {/* Actions */}
                {wallet.address && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {/* Creator: request release */}
                    {isCreator && info.state === 1 && m.state === 0 && (i === 0 || milestones[i - 1]?.state === 2) && (
                      <button
                        className="btn-primary text-sm py-1.5 px-3"
                        disabled={txLoading}
                        onClick={() => sendTx(() => getContract().requestMilestoneRelease(i), "開啟投票...")}
                      >
                        申請撥款（開啟投票）
                      </button>
                    )}

                    {/* Backer: vote */}
                    {isBacker && votingActive && (
                      <>
                        <button
                          className="bg-green-600 hover:bg-green-500 text-white text-sm py-1.5 px-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                          disabled={txLoading}
                          onClick={() => sendTx(() => getContract().voteOnMilestone(i, true), "投票中...")}
                        >
                          👍 贊成
                        </button>
                        <button
                          className="bg-red-600 hover:bg-red-500 text-white text-sm py-1.5 px-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                          disabled={txLoading}
                          onClick={() => sendTx(() => getContract().voteOnMilestone(i, false), "投票中...")}
                        >
                          👎 反對
                        </button>
                      </>
                    )}

                    {/* Anyone: finalize vote */}
                    {canFinalize && (
                      <button
                        className="btn-secondary text-sm py-1.5 px-3"
                        disabled={txLoading}
                        onClick={() => sendTx(() => getContract().finalizeVote(i), "計票中...")}
                      >
                        結算投票
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Backers Leaderboard */}
      {backers.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-display font-bold text-white mb-4">🏆 贊助者排行榜</h2>
          <div className="space-y-2">
            {backers.map((b, i) => {
              const tierColor = i === 0 ? "text-gold border-gold/30 bg-gold/10" : i === 1 ? "text-silver border-silver/30 bg-silver/10" : "text-bronze border-bronze/30 bg-bronze/10";
              const tierLabel = i === 0 ? "🥇 Gold" : i === 1 ? "🥈 Silver" : "🥉 Bronze";
              const isMe = b.address.toLowerCase() === wallet.address?.toLowerCase();

              return (
                <div key={b.address} className={`flex items-center justify-between p-3 rounded-xl border ${tierColor} ${isMe ? "ring-1 ring-brand" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold w-6 text-center">#{i + 1}</span>
                    <div>
                      <p className="font-mono text-sm text-slate-200">
                        {b.address.slice(0, 8)}...{b.address.slice(-6)}
                        {isMe && <span className="ml-2 text-brand text-xs">(你)</span>}
                      </p>
                      <p className="text-xs text-slate-500">{tierLabel}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-white">{Number(ethers.formatEther(b.amount)).toFixed(4)} ETH</p>
                    <p className="text-xs text-slate-500">{ethToUsd(Number(ethers.formatEther(b.amount)), ethPrice)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
