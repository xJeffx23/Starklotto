# StarkLotto

StarkLotto is a decentralized lottery game built on **Starknet** and **Stellar**, offering secure and transparent on-chain draws. It uses **Cairo** smart contracts on Starknet and **Rust/Soroban** smart contracts on Stellar, with a single unified **Next.js** frontend that supports both chains.

<!-- 🎥 Hackathon Video -->
<p align="center">
  <a href="https://www.youtube.com/watch?v=Lra23dFcTMw">
    <img src="https://img.youtube.com/vi/Lra23dFcTMw/maxresdefault.jpg" alt="StarkLotto Hackathon Video" width="720">
  </a>
</p>

<p align="center">
  ▶️ <a href="https://www.youtube.com/watch?v=Lra23dFcTMw"><b>Watch the Hackathon Video</b></a>
</p>

---

🌐 **Testnet Version:**
👉 [https://starklotto-eta.vercel.app/](https://starklotto-eta.vercel.app/)

---

## 🏗️ Monorepo Structure

```
starklotto/
├── packages/
│   ├── snfoundry/          # Cairo smart contracts (Starknet)
│   ├── soroban/            # Rust/Soroban smart contracts (Stellar)
│   └── nextjs/             # Unified Next.js frontend (both chains)
```

---

## 🚀 Features

- **Dual-chain lottery** — play on Starknet or Stellar from the same interface.
- **Cairo contracts** on Starknet: Lottery, ERC20 token (STRKP), Vault, NFT tickets, Randomness.
- **Soroban contracts** on Stellar: Lottery, StellarPlay token (STLP), Vault — commit-reveal randomness.
- **Chain-agnostic frontend** — a `ChainAdapter` abstraction layer decouples UI from chain-specific logic.
- **Wallet support** — Argent / Braavos (Starknet), Freighter / Albedo (Stellar).
- **NFT tickets** — each Starknet ticket is minted as an ERC721.
- **Progressive prize tiers** — 1 match: 1% · 2: 4% · 3: 10% · 4: 15% · 5 (Jackpot): 70%.
- **PWA-ready** frontend with i18n (i18next) and TailwindCSS + DaisyUI.

---

## 📜 Prerequisites

### Starknet stack

| Tool | Version |
|------|---------|
| Starknet-devnet | v0.4.0 |
| Scarb | v2.11.4 |
| Snforge | v0.41.0 |
| Cairo | v2.11.4 |
| RPC | v0.8.0 |

### Stellar stack

| Tool | Version |
|------|---------|
| Rust | stable (1.78+) |
| stellar-cli | v0.22+ |
| wasm32 target | `rustup target add wasm32-unknown-unknown` |

### General

| Tool | Version |
|------|---------|
| Node.js | LTS (compatible with Next.js 15) |
| Yarn | v3.2.3 |

---

## 🔧 Installation

### 1️⃣ Clone the repository

```sh
git clone https://github.com/FutureMindsTeam/starklotto.git
cd starklotto
```

> **Note:** To contribute, branch off `Dev` before making changes:
> ```bash
> git checkout -b feature/your-feature Dev
> ```

### 2️⃣ Install JS dependencies

```bash
yarn install
```

### 3️⃣ Configure environment variables

```bash
# Starknet (packages/snfoundry/)
cp packages/snfoundry/.env.example packages/snfoundry/.env

# Stellar (packages/soroban/)
cp packages/soroban/.env.example packages/soroban/.env

# Frontend (packages/nextjs/)
cp packages/nextjs/.env.example packages/nextjs/.env.local
```

Key variables for the frontend:

```env
# Starknet
NEXT_PUBLIC_DEVNET_PROVIDER_URL=http://127.0.0.1:5050
NEXT_PUBLIC_SEPOLIA_PROVIDER_URL=

# Stellar
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_LOTTERY_CONTRACT=
NEXT_PUBLIC_STELLAR_TOKEN_CONTRACT=
NEXT_PUBLIC_STELLAR_VAULT_CONTRACT=
```

---

## ⚡ Starknet — Local Development

### Start the local network

```bash
yarn chain
```

### Deploy contracts

```bash
yarn deploy          # Deploy (clears previous)
yarn deploy:no-reset # Deploy (keeps previous)
```

### Start the frontend

```bash
yarn start
```

Open [http://localhost:3000](http://localhost:3000).

### Compile contracts only

```bash
yarn compile
```

### Run Cairo tests

```bash
yarn test
```

---

## 🌟 Stellar — Development

### Install Rust target (one-time)

```bash
rustup target add wasm32-unknown-unknown
```

### Build Soroban contracts

```bash
yarn stellar:build
```

### Run Soroban tests

```bash
yarn stellar:test
```

### Format Soroban code

```bash
yarn stellar:fmt
```

### Deploy to Stellar Testnet

```bash
# 1. Set up your Stellar account in stellar-cli
stellar keys generate default --network testnet

# 2. Fund the account (testnet only)
stellar keys fund default --network testnet

# 3. Deploy contracts
yarn stellar:deploy:testnet
```

After deploying, copy the contract IDs into `packages/nextjs/.env.local`:

```env
NEXT_PUBLIC_STELLAR_LOTTERY_CONTRACT=C...
NEXT_PUBLIC_STELLAR_TOKEN_CONTRACT=C...
NEXT_PUBLIC_STELLAR_VAULT_CONTRACT=C...
```

### Deploy to Stellar Mainnet

```bash
yarn stellar:deploy:mainnet
```

---

## 🏛️ Architecture Overview

### Smart Contracts

#### Starknet (`packages/snfoundry/contracts/src/`)

| Contract | Description |
|----------|-------------|
| `Lottery.cairo` | Draw management, ticket purchase, prize distribution |
| `StarkPlayERC20.cairo` | Platform token (STRKP) with mint/burn/prize roles |
| `StarkPlayVault.cairo` | STRK ↔ STRKP conversion with fee management |
| `LottoTicketNFT.cairo` | ERC721 NFT per ticket |
| `MockRandomness.cairo` | Randomness oracle integration |

#### Stellar (`packages/soroban/contracts/`)

| Contract | Description |
|----------|-------------|
| `lottery/` | Draw management with commit-reveal randomness |
| `token/` | StellarPlay token (STLP), SEP-0041 compatible |
| `vault/` | XLM ↔ STLP conversion with fee management |

### Frontend (`packages/nextjs/`)

The frontend uses a **chain-adapter pattern** to remain agnostic of the underlying blockchain:

```
Page / Component
      ↓
useLotteryBuyTickets (unified hook)
      ↓  parallel pattern
useBuyTickets        useStellarBuyTickets
(Starknet hooks)     (Stellar hooks)
      ↓
  ChainAdapter interface
      ↓
Starknet contracts   Stellar Soroban contracts
```

Key directories:

| Path | Description |
|------|-------------|
| `services/chain-adapter/` | `ChainAdapter` interface, Starknet and Stellar adapters |
| `hooks/scaffold-stark/` | Starknet-specific hooks |
| `hooks/scaffold-stellar/` | Stellar-specific hooks |
| `hooks/useLottery*.ts` | Unified hooks (chain-agnostic) |
| `hooks/useChainAdapter.ts` | Assembles the write adapter for the active chain |
| `context/ChainContext.tsx` | Global chain selector (Starknet / Stellar) |
| `services/web3/stellar/` | Stellar wallet connectors and Soroban RPC helpers |
| `contracts/deployedContracts.ts` | Auto-generated Starknet contract addresses |
| `contracts/stellarContracts.ts` | Stellar contract IDs (from env vars) |

---

## 📝 Contributions

1. Fork the repository.
2. Create a branch off `Dev`:
```bash
git checkout -b feature/new-feature Dev
```
3. Make your changes and commit:
```bash
git commit -m "feat: description of change"
```
4. Push and open a Pull Request targeting `Dev`.

---

## 🤝 Contact

- Discord: [FutureMinds Community](https://discord.gg/ZAhZZDYn)
- X: [@futureminds_7](https://x.com/futureminds_7)
- Telegram: [Starklotto Contributors](https://t.me/StarklottoContributors)

---

## 🛠️ Command Reference

> This repo uses **Yarn** as package manager.

### General

| Command | Description |
|---------|-------------|
| `yarn install` | Install all JS dependencies |
| `yarn start` | Start the Next.js dev server |
| `yarn format` | Format all code (Cairo + TypeScript) |
| `yarn format:check` | Check formatting without writing changes |
| `yarn next:lint` | Run Next.js linter |
| `yarn next:check-types` | TypeScript type check |
| `yarn prepare` | Install Husky git hooks |

### Starknet — Smart Contracts

| Command | Description |
|---------|-------------|
| `yarn compile` | Compile Cairo contracts with Scarb |
| `yarn test` | Run Snforge test suite |
| `yarn chain` | Start local Starknet devnet |
| `yarn deploy` | Deploy contracts (clears previous) |
| `yarn deploy:no-reset` | Deploy contracts (keeps previous) |
| `yarn verify` | Verify contracts with Walnut |

### Stellar — Smart Contracts

| Command | Description |
|---------|-------------|
| `yarn stellar:build` | Compile Soroban contracts to WASM |
| `yarn stellar:test` | Run Soroban unit tests |
| `yarn stellar:fmt` | Format Rust code |
| `yarn stellar:fmt:check` | Check Rust formatting without writing |
| `yarn stellar:deploy:testnet` | Deploy contracts to Stellar Testnet |
| `yarn stellar:deploy:mainnet` | Deploy contracts to Stellar Mainnet |

### Frontend

| Command | Description |
|---------|-------------|
| `yarn start` | Start development server on localhost:3000 |
| `yarn test:nextjs` | Run Vitest test suite |
| `yarn vercel` | Deploy to Vercel |
| `yarn vercel:yolo` | Force deploy to Vercel (ignoring errors) |
