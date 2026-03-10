import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { WalletContext } from "../App";
import { FACTORY_ABI } from "../contracts/abis";
import { FACTORY_ADDRESS } from "../contracts/addresses";
import { uploadJsonToPinata, uploadFileToPinata } from "../utils/ipfs";
import { getEthUsdPrice, ethToUsd } from "../utils/chainlink";

interface Milestone {
  description: string;
  bps: string; // percentage string e.g. "30"
}

export default function CreateCampaign() {
  const wallet = useContext(WalletContext)!;
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalEth, setGoalEth] = useState("");
  const [deadlineStr, setDeadlineStr] = useState("");   // datetime-local value
  const [votingDays, setVotingDays] = useState("0");
  const [votingHours, setVotingHours] = useState("0");
  const [votingMins, setVotingMins] = useState("5");
  const [milestones, setMilestones] = useState<Milestone[]>([
    { description: "第一階段", bps: "34" },
    { description: "第二階段", bps: "33" },
    { description: "第三階段", bps: "33" },
  ]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [ethPrice, setEthPrice] = useState(0);

  // Load ETH price
  React.useEffect(() => {
    getEthUsdPrice().then(setEthPrice);
  }, []);

  const totalBps = milestones.reduce((s, m) => s + Number(m.bps || 0), 0);

  function addMilestone() {
    setMilestones([...milestones, { description: "", bps: "0" }]);
  }

  function removeMilestone(i: number) {
    setMilestones(milestones.filter((_, idx) => idx !== i));
  }

  function updateMilestone(i: number, field: keyof Milestone, val: string) {
    const updated = [...milestones];
    updated[i] = { ...updated[i], [field]: val };
    setMilestones(updated);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  // Set minimum datetime: now + 5 minutes
  const minDatetime = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.signer) { alert("請先連接錢包"); return; }
    if (!FACTORY_ADDRESS) { alert("合約尚未部署，請先部署合約"); return; }
    if (totalBps !== 100) { alert("里程碑百分比總和必須等於 100%"); return; }
    if (!deadlineStr) { alert("請設定截止時間"); return; }
    const totalVotingMins = Number(votingDays) * 24 * 60 + Number(votingHours) * 60 + Number(votingMins);
    if (totalVotingMins < 1) { alert("投票時間至少 1 分鐘"); return; }

    setLoading(true);
    try {
      // 1. Upload image to IPFS (if any)
      setStatusMsg("上傳圖片到 IPFS...");
      let imageCid = "";
      if (imageFile) {
        imageCid = await uploadFileToPinata(imageFile);
      }

      // 2. Upload metadata JSON to IPFS
      setStatusMsg("上傳說明資料到 IPFS...");
      const metadataHash = await uploadJsonToPinata({
        title,
        description,
        imageCid,
        createdAt: Date.now(),
      });

      // 3. Build params
      const deadlineTimestamp = Math.floor(new Date(deadlineStr).getTime() / 1000);
      const votingDurationSec = totalVotingMins * 60;
      const goalWei = ethers.parseEther(goalEth);
      const mDescriptions = milestones.map((m) => m.description);
      const mBps = milestones.map((m) => Math.round(Number(m.bps) * 100)); // convert % to BPS

      // 4. Send transaction
      setStatusMsg("等待 MetaMask 確認...");
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet.signer);
      const tx = await factory.createCampaign(
        title,
        metadataHash,
        goalWei,
        deadlineTimestamp,
        votingDurationSec,
        mDescriptions,
        mBps
      );

      setStatusMsg("交易確認中，請稍候...");
      const receipt = await tx.wait();

      // Get campaign address from event
      const iface = new ethers.Interface(FACTORY_ABI);
      let campaignAddr = "";
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "CampaignCreated") {
            campaignAddr = parsed.args.campaignAddress;
          }
        } catch { /* skip */ }
      }

      setStatusMsg("募資活動建立成功！");
      setTimeout(() => navigate(campaignAddr ? `/campaign/${campaignAddr}` : "/"), 1000);
    } catch (e: any) {
      console.error(e);
      setStatusMsg("");
      alert(e?.reason || e?.message || "交易失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-white mb-2">發起募資活動</h1>
        <p className="text-slate-400">填寫以下資料，合約將部署在 Sepolia 測試網</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="card">
          <h2 className="text-lg font-display font-bold text-white mb-4">基本資訊</h2>
          <div className="space-y-4">
            <div>
              <label className="label">活動標題 *</label>
              <input
                className="input"
                placeholder="輸入吸引人的標題"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">活動說明</label>
              <textarea
                className="input min-h-[100px] resize-y"
                placeholder="描述你的計畫、目標和動機..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="label">封面圖片</label>
              <div
                className="border-2 border-dashed border-dark-500 hover:border-brand rounded-xl p-6 text-center cursor-pointer transition-colors"
                onClick={() => document.getElementById("img-input")?.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="h-40 object-cover rounded-lg mx-auto" />
                ) : (
                  <div>
                    <div className="text-3xl mb-2">📷</div>
                    <p className="text-slate-400 text-sm">點擊上傳圖片（上傳至 IPFS）</p>
                  </div>
                )}
                <input id="img-input" type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </div>
            </div>
          </div>
        </div>

        {/* Funding Goal */}
        <div className="card">
          <h2 className="text-lg font-display font-bold text-white mb-4">募資目標</h2>
          <div>
            <label className="label">目標金額（ETH）*</label>
            <div className="relative">
              <input
                className="input pr-24"
                type="number"
                step="0.001"
                min="0.001"
                placeholder="0.1"
                value={goalEth}
                onChange={(e) => setGoalEth(e.target.value)}
                required
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                {goalEth && ethPrice > 0
                  ? `≈ ${ethToUsd(Number(goalEth), ethPrice)}`
                  : "ETH"}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="card">
          <h2 className="text-lg font-display font-bold text-white mb-4">時間設定</h2>
          <div className="space-y-4">
            <div>
              <label className="label">募資截止時間 *</label>
              <input
                className="input"
                type="datetime-local"
                min={minDatetime}
                value={deadlineStr}
                onChange={(e) => setDeadlineStr(e.target.value)}
                required
              />
              {deadlineStr && (
                <p className="text-xs text-slate-500 mt-1">
                  Unix timestamp: {Math.floor(new Date(deadlineStr).getTime() / 1000)}
                </p>
              )}
            </div>
            <div>
              <label className="label">里程碑投票時間 *</label>
              <div className="flex gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={votingDays}
                    onChange={(e) => setVotingDays(e.target.value)}
                  />
                  <span className="text-slate-400 text-sm whitespace-nowrap">天</span>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="23"
                    step="1"
                    placeholder="0"
                    value={votingHours}
                    onChange={(e) => setVotingHours(e.target.value)}
                  />
                  <span className="text-slate-400 text-sm whitespace-nowrap">小時</span>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    placeholder="5"
                    value={votingMins}
                    onChange={(e) => setVotingMins(e.target.value)}
                  />
                  <span className="text-slate-400 text-sm whitespace-nowrap">分鐘</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Milestones */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-bold text-white">里程碑</h2>
            <span className={`text-sm font-semibold ${totalBps === 100 ? "text-green-400" : "text-red-400"}`}>
              合計 {totalBps}% {totalBps === 100 ? "✓" : "（需等於 100%）"}
            </span>
          </div>
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <div key={i} className="flex gap-3 items-center bg-dark-600 rounded-xl p-3">
                <div className="w-7 h-7 rounded-full bg-brand/20 text-brand text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </div>
                <input
                  className="input flex-1 py-2 text-sm"
                  placeholder={`里程碑 ${i + 1} 說明`}
                  value={m.description}
                  onChange={(e) => updateMilestone(i, "description", e.target.value)}
                  required
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    className="input w-20 py-2 text-sm text-center"
                    type="number"
                    min="1"
                    max="100"
                    value={m.bps}
                    onChange={(e) => updateMilestone(i, "bps", e.target.value)}
                    required
                  />
                  <span className="text-slate-400 text-sm">%</span>
                </div>
                {milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMilestone(i)}
                    className="text-red-400 hover:text-red-300 text-lg flex-shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addMilestone}
              className="btn-secondary w-full text-sm"
            >
              + 新增里程碑
            </button>
          </div>
        </div>

        {/* NFT Info */}
        <div className="card bg-dark-600/50 border-brand/20">
          <h3 className="text-sm font-semibold text-brand mb-2">🏆 NFT 獎勵說明</h3>
          <p className="text-slate-400 text-sm">
            活動結束後（不論成功或失敗），系統將自動發放 NFT：
          </p>
          <div className="flex gap-4 mt-2 text-sm">
            <span className="text-gold">🥇 捐款第 1 名 → Gold</span>
            <span className="text-silver">🥈 捐款第 2 名 → Silver</span>
            <span className="text-bronze">🥉 其他所有人 → Bronze</span>
          </div>
        </div>

        {/* Submit */}
        {statusMsg && (
          <div className="card bg-brand/10 border-brand/30 text-brand text-center text-sm font-medium">
            ⏳ {statusMsg}
          </div>
        )}

        {!wallet.address ? (
          <div className="text-center">
            <p className="text-slate-400 mb-3">請先連接錢包才能發起募資</p>
          </div>
        ) : (
          <button
            type="submit"
            disabled={loading || totalBps !== 100}
            className="btn-primary w-full text-base py-3"
          >
            {loading ? "處理中..." : "🚀 發起募資活動"}
          </button>
        )}
      </form>
    </div>
  );
}
