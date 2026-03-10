# CrowdChain — 去中心化眾籌平台

> 碩一寒假作業｜區塊鏈智慧合約 DApp

**Live Demo：** https://crowdfunding-dapp-nine.vercel.app

---

## 專案簡介

CrowdChain 是一個部署在 Ethereum Sepolia 測試網上的去中心化眾籌平台。贊助者直接透過智慧合約出資，資金由合約保管，創辦人需逐步通過里程碑投票才能提領，保障資金安全。每位贊助者在活動結束後（不論成功或失敗）皆可獲得專屬 NFT。

---

## 技術架構

### 1. 區塊鏈智慧合約（Solidity + Hardhat）

| 合約 | 功能 |
|------|------|
| `CrowdfundingFactory` | 工廠合約，統一部署各個 Campaign |
| `Campaign` | 每個募資活動的核心邏輯（出資、里程碑、投票、退款） |
| `BackerNFT` | ERC-721，活動結束時依排名發放 Gold / Silver / Bronze |
| `CrowdToken` | ERC-20，出資時即時鑄造 CROWD 代幣（1 ETH = 1000 CROWD） |

- OpenZeppelin v5（ERC-721、ERC-20、ReentrancyGuard）
- Solidity ^0.8.25，EVM：Cancun，viaIR 優化
- 平台手續費：2.5%（BPS 250）

**已部署合約（Sepolia）：**

```
CrowdfundingFactory : 0x14Cb929542ECb100D6E8Aa0ec16c35658D8c8318
BackerNFT           : 0x971cdE738DD439391a0E5e09aF7BC4d45b77eb4a
CrowdToken          : 0xfd459db7A7aE8dd8C0018Aeb45657dAC2afC9ee4
```

### 2. IPFS（Pinata）

募資活動的標題、說明文字與封面圖片皆上傳至 IPFS，鏈上只儲存 CID（Content ID），實現去中心化的資料儲存。

```typescript
// frontend/src/utils/ipfs.ts
export async function uploadFileToPinata(file: File): Promise<string>
export async function uploadJsonToPinata(json: object): Promise<string>
```

### 3. Blockchain Oracle（Chainlink）

首頁即時顯示 ETH/USD 匯率，資料來源為 Chainlink 去中心化預言機，優先使用 Chainlink，逾時（5 秒）自動切換 CoinGecko 備援。

```typescript
// Chainlink ETH/USD Price Feed on Sepolia
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

// frontend/src/utils/chainlink.ts
export async function getEthUsdPrice(): Promise<number>
```

### 4. 網頁呈現及接收參數（React + Vite）

| 頁面 | 路由 | 說明 |
|------|------|------|
| 首頁 | `/` | 活動列表、ETH/USD 報價、篩選功能 |
| 發起募資 | `/create` | 填寫表單並上傳至 IPFS，呼叫合約建立活動 |
| 活動詳情 | `/campaign/:address` | 出資、里程碑投票、申請撥款、領取退款 |
| 我的帳號 | `/my-account` | 我的 NFT、發起的活動、參與的活動 |

- MetaMask 錢包連接（EIP-1193）
- ethers.js v6 與合約互動
- Tailwind CSS 深色主題 UI

### 5. 資安技術

#### ReentrancyGuard — 防止重入攻擊

繼承 OpenZeppelin 的 `ReentrancyGuard`，在所有涉及 ETH 轉帳的函式加上 `nonReentrant`，防止攻擊者在回呼中反覆提領。

```solidity
// contracts/Campaign.sol
contract Campaign is ReentrancyGuard {
    ...
    function contribute() external payable nonReentrant onlyActive { ... }
    function finalizeVote(uint256 milestoneIndex) external nonReentrant { ... }
    function claimRefund() external nonReentrant { ... }
}
```

#### Pull Payment 退款 — 防止 DoS 攻擊

退款採「拉取」模式：合約不主動推送 ETH，而是記錄每位用戶的待退款金額，由用戶自行呼叫 `claimRefund()` 提領。若改用迴圈逐一推送，攻擊者可部署一個拒絕接收 ETH 的合約來阻塞整個退款流程。

```solidity
// contracts/Campaign.sol
mapping(address => uint256) public pendingRefunds;

// 退款時只記錄金額，不主動轉帳
function finalizeCampaign() external {
    ...
    for (uint256 i = 0; i < backers.length; i++) {
        pendingRefunds[backers[i]] += contributions[backers[i]].amount;
    }
}

// 由用戶自行提領，避免單一失敗阻塞所有人
function claimRefund() external nonReentrant {
    uint256 refundAmount = pendingRefunds[msg.sender];
    require(refundAmount > 0, "Campaign: no pending refund");
    pendingRefunds[msg.sender] = 0;  // 先清零再轉帳，防重入
    (bool ok, ) = msg.sender.call{value: refundAmount}("");
    require(ok, "Campaign: refund transfer failed");
}
```

#### 身份驗證 Modifier

限制敏感操作只能由特定角色呼叫。

```solidity
// contracts/Campaign.sol
modifier onlyCreator() {
    require(msg.sender == creator, "Campaign: caller is not creator");
    _;
}

modifier onlyBacker() {
    require(contributions[msg.sender].amount > 0, "Campaign: caller is not a backer");
    _;
}

// 只有創辦人能申請撥款
function requestMilestoneRelease(uint256 milestoneIndex) external onlyCreator { ... }

// 只有贊助者能投票
function voteOnMilestone(uint256 milestoneIndex, bool support) external onlyBacker { ... }
```

#### BPS 總和驗證 — 防止資金損失

建立活動時，強制驗證所有里程碑的資金比例加總必須等於 10000 BPS（100%），確保合約內的 ETH 能被完整分配，不會有資金永久鎖在合約中。

```solidity
// contracts/Campaign.sol
constructor(...) {
    uint256 totalBPS;
    for (uint256 i = 0; i < _milestoneFundingBPS.length; i++) {
        require(_milestoneFundingBPS[i] > 0, "Campaign: milestone BPS must be positive");
        totalBPS += _milestoneFundingBPS[i];
    }
    require(totalBPS == 10000, "Campaign: milestone BPS must sum to 10000");
}
```

#### Chainlink 去中心化預言機 — 防止價格操控

ETH/USD 報價來自 Chainlink 去中心化預言機，而非單一中心化 API，避免價格被惡意操控。

```solidity
// Chainlink AggregatorV3Interface — 讀取鏈上報價
const feed = new ethers.Contract(
    "0x694AA1769357215DE4FAC081bf1f309aDC325306", // Sepolia ETH/USD
    CHAINLINK_ABI,
    provider
);
const [, answer] = await feed.latestRoundData();
const decimals = await feed.decimals();
const price = Number(answer) / 10 ** decimals;
```

---

## 遊戲規則

### 募資流程

```
發起活動 → 贊助者出資 → 截止後結算 → 里程碑投票循環 → 完成 / 失敗
```

1. **創辦人**設定目標金額、截止時間、里程碑（百分比總和 = 100%）
2. **贊助者**在截止前出資，立即獲得 CROWD 代幣
3. 截止後任何人可呼叫 `finalizeCampaign()`
   - 達標 → 狀態變 SUCCESSFUL，進入里程碑流程
   - 未達標 → 狀態變 FAILED，所有人可領退款
4. **里程碑投票**：
   - 創辦人申請撥款 → 開啟投票計時
   - 贊助者依出資金額加權投票（一票一 wei）
   - 需達 10% quorum 且贊成 > 反對 才算通過
   - 通過 → 資金撥給創辦人（扣 2.5% 平台費）
   - 否決 → 該里程碑資金比例退還所有贊助者，活動結束
5. 全部里程碑通過 → 活動狀態變 COMPLETED

### NFT 發放規則

| 排名 | NFT |
|------|-----|
| 捐款第 1 名 | 🥇 Gold NFT |
| 捐款第 2 名 | 🥈 Silver NFT |
| 其餘所有人 | 🥉 Bronze NFT |
| 只有 1 位贊助者 | Gold + Silver 都給那個人 |

NFT 在 `finalizeCampaign()` 時發放，**不論活動成功或失敗**皆發放。

---

## 本地開發

### 環境需求

- Node.js 18+
- MetaMask 瀏覽器擴充套件
- Sepolia 測試幣（可至 https://faucet.sepolia.dev 領取）

### 安裝

```bash
# 安裝合約依賴
cd crowdfunding-platform
npm install

# 安裝前端依賴
cd frontend
npm install
```

### 環境變數設定

建立 `crowdfunding-platform/.env`：

```env
ALCHEMY_API_KEY=你的_Alchemy_API_Key
PRIVATE_KEY=你的_MetaMask_私鑰
```

建立 `crowdfunding-platform/frontend/.env`：

```env
VITE_ALCHEMY_API_KEY=你的_Alchemy_API_Key
VITE_PINATA_JWT=你的_Pinata_JWT
VITE_FACTORY_ADDRESS=0x...
VITE_NFT_ADDRESS=0x...
VITE_TOKEN_ADDRESS=0x...
VITE_NETWORK_ID=11155111
```

### 部署合約

```bash
# 編譯
npx hardhat compile

# 部署到 Sepolia
npx hardhat run scripts/deploy.ts --network sepolia
```

部署完成後將輸出的合約地址填入 `frontend/.env`。

### 啟動前端

```bash
cd frontend
npm run dev
```

瀏覽器開啟 http://localhost:5173

---

## 部署

前端部署於 [Vercel](https://vercel.com)，與 GitHub 倉庫連動，push 到 `main` 分支後自動重新部署。

```
Root Directory : frontend
Build Command  : npm run build
Output Dir     : dist
```

---

## 專案結構

```
crowdfunding-platform/
├── contracts/
│   ├── Campaign.sol              # 募資活動核心合約
│   ├── CrowdfundingFactory.sol   # 工廠合約
│   ├── BackerNFT.sol             # ERC-721 NFT 合約
│   └── CrowdToken.sol            # ERC-20 代幣合約
├── scripts/
│   ├── deploy.ts                 # 部署腳本
│   └── setup-demo.ts             # Demo 資料建立
├── test/                         # 合約測試
├── frontend/
│   ├── src/
│   │   ├── pages/                # React 頁面元件
│   │   ├── components/           # Navbar 等共用元件
│   │   ├── hooks/                # useWallet MetaMask hook
│   │   ├── contracts/            # ABI 及合約地址
│   │   └── utils/                # IPFS、Chainlink 工具函式
│   └── ...
└── hardhat.config.ts
```

---

## 使用技術

| 類別 | 技術 |
|------|------|
| 智慧合約 | Solidity 0.8.26、Hardhat、OpenZeppelin v5 |
| 前端框架 | React 18、Vite、TypeScript |
| 樣式 | Tailwind CSS |
| 區塊鏈互動 | ethers.js v6 |
| 錢包 | MetaMask（EIP-1193） |
| 去中心化儲存 | IPFS（Pinata） |
| 預言機 | Chainlink ETH/USD Price Feed |
| 測試網路 | Ethereum Sepolia |
| 前端託管 | Vercel |
| 版本控制 | GitHub |
