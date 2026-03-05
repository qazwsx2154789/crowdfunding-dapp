# 去中心化眾籌平台 (Decentralized Crowdfunding DApp)

一個部署在以太坊區塊鏈上的去中心化眾籌平台。發起人可以設定募款目標與里程碑計畫，支持者以 ETH 贊助後享有投票權，共同決定每個里程碑的資金是否釋出，實現透明、可信賴的資金管理機制。

---

## 目錄

- [專案背景](#專案背景)
- [技術棧](#技術棧)
- [核心機制說明](#核心機制說明)
- [智能合約架構](#智能合約架構)
- [前端架構](#前端架構)
- [本地開發指南](#本地開發指南)
- [示範資料](#示範資料)
- [測試](#測試)

---

## 專案背景

傳統眾籌平台（如 Kickstarter）的問題在於：發起人收到款項後，支持者無法確保資金被正確使用。本專案透過智能合約解決這個問題：

- 資金**鎖定在合約中**，發起人無法直接提領
- 發起人需將計畫分成多個**里程碑**，每個里程碑對應一部分資金
- 每個里程碑發放前，需要**支持者投票同意**
- 若投票未通過，資金繼續鎖定，保護支持者權益

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 智能合約語言 | Solidity ^0.8.25 |
| 合約開發框架 | Hardhat + TypeScript |
| 合約函式庫 | OpenZeppelin v5（ERC-721、ERC-20、Ownable） |
| 前端框架 | React 18 + Vite + TypeScript |
| 區塊鏈互動 | wagmi v2 + viem |
| 錢包連接 | RainbowKit v2 |
| 本地測試鏈 | Hardhat Network（ChainID 31337） |

---

## 核心機制說明

### 1. 建立募款活動

發起人在前端填寫以下資訊：
- **標題**：募款活動名稱
- **IPFS Hash**：詳細說明文件的 IPFS 連結（選填）
- **目標金額**：以 ETH 計算
- **截止日期**：募款結束時間
- **里程碑列表**：每個里程碑包含名稱與資金比例（BPS，10000 = 100%）

合約由 `CrowdfundingFactory` 部署，每次建立活動就產生一個獨立的 `Campaign` 合約。

---

### 2. 募款機制

- 支持者在截止日前可以多次贊助，每次以 ETH 轉帳至合約
- 截止日到期後，任何人皆可呼叫 `finalizeCampaign()` 觸發結算：
  - **達到目標金額** → 狀態變為 `SUCCESSFUL`，資金進入里程碑管理流程
  - **未達目標金額** → 狀態變為 `FAILED`，支持者可申請退款

| 狀態 | 說明 |
|------|------|
| ACTIVE | 募款進行中，可接受贊助 |
| SUCCESSFUL | 達標，等待里程碑投票 |
| COMPLETED | 所有里程碑完成 |
| FAILED | 未達標，支持者可退款 |

---

### 3. 里程碑投票機制

募款成功後，發起人依序對每個里程碑發起投票（`requestMilestoneRelease()`）：

**投票規則：**
- 投票期限為 **7 天**
- 每位支持者的投票權重 = 其贊助的 ETH 金額（以 wei 計算）
- 需達到 **10% Quorum**：參與投票的 ETH 總量須佔募款總額 10% 以上
- 超過半數贊成 → **里程碑批准（APPROVED）**，對應資金自動轉給發起人
- 半數以上反對，或 Quorum 不足 → **里程碑否決（REJECTED）**，資金繼續鎖定

| 里程碑狀態 | 說明 |
|------------|------|
| PENDING | 等待發起人啟動投票 |
| VOTING | 投票進行中 |
| APPROVED | 投票通過，資金已釋出 |
| REJECTED | 投票未通過 |

**里程碑順序限制：** 第 N 個里程碑必須在第 N-1 個里程碑被批准後，才能啟動投票，確保發起人按順序完成計畫。

---

### 4. NFT 獎勵機制（BackerNFT）

支持者每次贊助成功後，根據累計贊助金額自動獲得 ERC-721 NFT：

| 贊助金額 | NFT 等級 |
|----------|----------|
| ≥ 1 ETH | 金級 NFT（Tier 2） |
| ≥ 0.1 ETH | 銀級 NFT（Tier 1） |
| < 0.1 ETH | 無 NFT |

NFT 記錄在 `BackerNFT` 合約中，可在 MetaMask 或 OpenSea（測試網）中查看。

---

### 5. 平台代幣獎勵（CrowdToken）

每贊助 **1 ETH** 即獲得 **1000 CrowdToken**（ERC-20）。

可在 MetaMask 中手動匯入代幣合約地址查看餘額。

---

### 6. 退款機制

募款失敗（FAILED）後，支持者可呼叫 `claimRefund()` 申請退款，合約會將對應金額的 ETH 退回至支持者錢包。

---

## 智能合約架構

```
contracts/
├── CrowdfundingFactory.sol   # 工廠合約
├── Campaign.sol              # 募款活動合約（核心邏輯）
├── BackerNFT.sol             # 支持者 NFT（ERC-721）
└── CrowdToken.sol            # 平台代幣（ERC-20）
```

### CrowdfundingFactory
- 部署並追蹤所有 `Campaign` 合約
- 提供 `getAllCampaigns()` 供前端列表查詢
- 發出 `CampaignCreated` 事件

### Campaign
- 核心業務邏輯：募款、里程碑、投票、退款
- 主要函數：
  - `contribute()` - 贊助
  - `finalizeCampaign()` - 結算募款
  - `requestMilestoneRelease(index)` - 發起里程碑投票（僅發起人）
  - `voteOnMilestone(index, support)` - 投票（僅支持者）
  - `finalizeVote(index)` - 結算投票並釋出資金
  - `claimRefund()` - 申請退款（募款失敗後）
  - `getCampaignInfo()` - 查詢活動資訊
  - `getMilestone(index)` - 查詢里程碑資訊

### BackerNFT（ERC-721）
- 由 `Campaign` 合約在贊助時自動 mint
- 記錄 NFT 等級（tier）

### CrowdToken（ERC-20）
- 由 `Campaign` 合約在贊助時自動 mint
- 固定匯率：1 ETH = 1000 CrowdToken

---

## 前端架構

```
frontend/src/
├── abis/               # 合約 ABI（從 artifacts 提取）
│   ├── CrowdfundingFactory.json
│   ├── Campaign.json
│   └── index.ts
├── config/
│   ├── wagmi.ts        # wagmi + RainbowKit 設定（Hardhat 本地網路）
│   └── contracts.ts    # 合約地址常數（從 .env.local 讀取）
├── types/
│   └── campaign.ts     # TypeScript 型別定義（CampaignState、MilestoneState 等）
├── hooks/              # wagmi 自定義 hooks
│   ├── useCampaigns.ts            # 讀取所有募款活動列表
│   ├── useCampaignDetail.ts       # 讀取單一活動詳情 + 里程碑
│   ├── useContribute.ts           # 贊助
│   ├── useCreateCampaign.ts       # 建立新活動
│   ├── useVote.ts                 # 里程碑投票
│   ├── useClaimRefund.ts          # 申請退款
│   ├── useRequestMilestoneRelease.ts  # 發起里程碑投票
│   └── useFinalizeVote.ts         # 結算投票
├── components/         # React 元件
│   ├── Layout.tsx          # 頁面框架（Header + ConnectButton）
│   ├── CampaignCard.tsx    # 募款活動卡片
│   ├── ContributeForm.tsx  # 贊助表單
│   ├── MilestoneCard.tsx   # 里程碑卡片（含投票 UI）
│   └── RefundButton.tsx    # 退款按鈕
└── pages/              # 頁面
    ├── HomePage.tsx           # 首頁（活動列表）
    ├── CreateCampaignPage.tsx # 建立活動頁面
    └── CampaignDetailPage.tsx # 活動詳情頁面
```

---

## 本地開發指南

### 環境需求

- Node.js 18+
- MetaMask 瀏覽器擴充功能

### 安裝依賴

```bash
# 根目錄（智能合約）
npm install

# 前端
cd frontend && npm install && cd ..
```

### 步驟一：啟動本地測試鏈

```bash
npx hardhat node
```

啟動後會顯示 20 個測試帳戶及其私鑰，記下前幾組備用。

### 步驟二：部署合約

開新終端：

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

輸出範例：
```
CrowdfundingFactory deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
BackerNFT deployed to: 0xa16E02E87b7454126E5E10d957A927A7F5B5d2be
CrowdToken deployed to: 0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968
```

### 步驟三：設定前端環境變數

```bash
echo "VITE_FACTORY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3" > frontend/.env.local
```

### 步驟四：啟動前端

```bash
cd frontend && npm run dev
```

開啟瀏覽器：http://localhost:5173

### 步驟五：設定 MetaMask

1. **新增網路**：
   - 網路名稱：Hardhat Local
   - RPC URL：`http://127.0.0.1:8545`
   - Chain ID：`31337`
   - 貨幣符號：ETH

2. **匯入測試帳戶**：
   - 在 MetaMask 點「匯入帳戶」→「私密金鑰」
   - 貼上 `npx hardhat node` 輸出的私鑰
   - 建議匯入至少 4 個帳戶（1 個發起人 + 3 個支持者）

> **注意**：重新啟動 `npx hardhat node` 後，需在 MetaMask 的「設定 > 進階 > 重設帳戶」清除 nonce 紀錄，否則交易會失敗。

---

## 示範資料

執行以下腳本，自動建立兩個示範募款活動：

```bash
npx hardhat run scripts/setup-demo.ts --network localhost
```

| 活動 | 狀態 | 說明 |
|------|------|------|
| TestProject1 | SUCCESSFUL ✓ | 已籌滿 10 ETH，可體驗里程碑投票流程 |
| TestProject2 | FAILED ✗ | 只籌到 5 ETH，支持者可申請退款 |

**TestProject1 操作流程：**
1. 切換至發起人帳戶（Account 1）
2. 進入 TestProject1 詳情頁
3. 點「🗳️ 啟動此里程碑投票」
4. 切換至支持者帳戶，點「👍 贊成」或「👎 反對」
5. 點「⏩ 快轉 7 天」（開發工具，讓投票截止）
6. 點「✅ 結算投票 / 發放資金」

---

## 測試

```bash
npx hardhat test
```

共 **78 個測試**，涵蓋：
- `BackerNFT.test.ts`：NFT mint、等級、存取控制
- `CrowdfundingFactory.test.ts`：建立活動、列表查詢
- `Campaign.test.ts`：募款、結算、里程碑、投票、退款
- `integration.test.ts`：完整端對端流程測試

```
  78 passing
```
