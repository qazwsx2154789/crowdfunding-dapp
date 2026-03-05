# 去中心化眾籌平台 (Crowdfunding DApp)

一個基於以太坊區塊鏈的去中心化眾籌平台，支援里程碑式資金管理與支持者投票機制。

## 技術棧

- **智能合約**：Solidity ^0.8.25 + Hardhat + OpenZeppelin v5
- **前端**：React + Vite + TypeScript + wagmi v2 + RainbowKit
- **本地測試網**：Hardhat Network（ChainID 31337）

## 核心功能

### 募款機制
- 發起人設定募款目標金額與截止日期
- 支持者以 ETH 進行贊助
- 截止日到期後自動結算：達標 → SUCCESSFUL，未達標 → FAILED
- 募款失敗時，支持者可申請全額退款

### 里程碑投票機制
- 發起人將募款資金分配至多個里程碑（以 BPS 百分比表示）
- 每個里程碑需依序發起投票，由支持者決定是否釋出該筆資金
- 投票權重依贊助金額計算（以 ETH wei 為單位）
- 投票期 7 天，需達 10% quorum（參與投票的 ETH 佔總募款額 10% 以上）
- 超過半數贊成 → 里程碑批准，資金自動轉給發起人
- 否決或 quorum 不足 → 里程碑否決，資金留存

### NFT 獎勵（BackerNFT）
- 贊助滿 1 ETH → 獲得金級 NFT（tier 2）
- 贊助滿 0.1 ETH → 獲得銀級 NFT（tier 1）
- 贊助不足 0.1 ETH → 無 NFT

### 平台代幣（CrowdToken）
- 每贊助 1 ETH 獲得 1000 CrowdToken（ERC-20）
- 可在 MetaMask 中匯入查看

## 專案結構

```
crowdfunding-dapp/
├── contracts/                  # Solidity 智能合約
│   ├── CrowdfundingFactory.sol # 工廠合約，管理所有募款活動
│   ├── Campaign.sol            # 單一募款活動合約
│   ├── BackerNFT.sol           # 支持者 NFT（ERC-721）
│   └── CrowdToken.sol          # 平台代幣（ERC-20）
├── test/                       # Hardhat 測試（78 個測試全部通過）
├── scripts/
│   ├── deploy.ts               # 部署腳本
│   └── setup-demo.ts           # 建立示範募款活動腳本
├── hardhat.config.ts
└── frontend/                   # React 前端
    └── src/
        ├── abis/               # 合約 ABI
        ├── config/             # wagmi + 合約地址設定
        ├── hooks/              # wagmi 自定義 hooks
        ├── components/         # React 元件
        ├── pages/              # 頁面
        └── types/              # TypeScript 型別定義
```

## 本地開發

### 環境需求
- Node.js 18+
- MetaMask 瀏覽器擴充功能

### 啟動步驟

```bash
# 1. 安裝依賴
npm install
cd frontend && npm install && cd ..

# 2. 啟動本地測試鏈
npx hardhat node

# 3. 部署合約（新終端）
npx hardhat run scripts/deploy.ts --network localhost

# 4. 設定前端環境變數
echo "VITE_FACTORY_ADDRESS=0x<部署輸出的地址>" > frontend/.env.local

# 5. 啟動前端
cd frontend && npm run dev
```

### MetaMask 設定
1. 新增網路：RPC URL = `http://127.0.0.1:8545`，Chain ID = `31337`
2. 匯入測試帳戶：從 `npx hardhat node` 輸出複製私鑰

### 建立示範資料

```bash
npx hardhat run scripts/setup-demo.ts --network localhost
```

會建立兩個示範募款活動：
- **TestProject1**：已籌滿 10 ETH（SUCCESSFUL），可體驗里程碑投票流程
- **TestProject2**：只籌到 5 ETH（FAILED），支持者可申請退款

## 智能合約測試

```bash
npx hardhat test
# 78 passing
```
