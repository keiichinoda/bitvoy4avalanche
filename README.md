# BitVoy — Ultra-Fast On-Chain Payment Infrastructure

BitVoy is a **Web3 payment infrastructure optimized for real-world commerce**, designed to achieve **near-instant on-chain checkout**.

By combining:

- Passkey-based authentication
- MPC-secured wallet infrastructure
- Intent-based payment authorization
- Avalanche’s high-speed transaction finality

BitVoy enables **extremely fast blockchain payments suitable for e-commerce environments**.

---

# Why We Use Avalanche Mainnet

This project prioritizes **payment speed and real transaction performance**.

Therefore, during the Build Games development phase we run the system on:

**Avalanche C-Chain Mainnet**

instead of the Fuji testnet.

The goal is to measure:

- Real network latency
- Real gas behavior
- End-to-end payment execution time

This allows us to evaluate whether **sub-second on-chain checkout experiences** are achievable using Avalanche.

---

# System Architecture Overview

BitVoy supports two execution modes.

### STANDARD Mode

A high-speed payment mode optimized for Avalanche.

Characteristics:

- Direct transaction execution
- Minimal overhead
- Optimized for fastest checkout

This mode is currently used by merchants.

---

### SA Mode (Account Abstraction)

ERC-4337 based Smart Account execution.

Characteristics:

- UserOperation execution
- Paymaster gas sponsorship
- Advanced smart wallet logic

SA Mode exists to support broader ecosystem compatibility, but STANDARD Mode is used for **maximum payment speed**.

---

# How to Verify the System

## 1. Onboarding

### Method 1 — Direct Registration

Register from the BitVoy site

https://dev.bitvoy.org


### Method 2 — Merchant Login (OIDC Login API)

Register via a merchant site using OIDC authentication

https://memberdev.bitvoy.net

---

# 2. Deposit

## SA Mode

Login → Coins → **[SA] JPYC (Avalanche)**  
Deposit to the displayed Receive address.

---

## STANDARD Mode

Login → Coins → **JPYC (Avalanche)**  
Deposit to the displayed Receive address.

Gas fee must be deposited to:

AVAX (Avalanche) → Receive address

Notes:

- **USDC can also be used instead of JPYC**
- Currently **merchant integrations use STANDARD Mode**

---

# 3. Execute Payment

Merchant Flow

Merchant Site  
→ Membership  
→ Select Product  
→ Add to Cart  
→ Checkout  
→ OIDC Payment starts

After checkout:

1. The frontend waits briefly
2. The user returns to the merchant site
3. The merchant backend receives a **webhook notification**
4. The purchase record is added automatically

Both **SA Mode** and **STANDARD Mode** follow the same process.

---

# API Specifications

For API specifications including OIDC Payment, see:

English  
bitvoy-oidc-provider/docs/OIDC-API-SPEC-EN.md

Japanese  
bitvoy-oidc-provider/docs/OIDC-API-SPEC-JP.md

---

# Smart Contract Addresses

## EntryPoint（All Chains）

| Contract | Explorer |
|---|---|
| ERC-4337 EntryPoint v0.6 | [View on Snowtrace](https://snowtrace.io/address/0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789) |

---

## Avalanche C-Chain Mainnet (43114)

| Contract | Explorer |
|---|---|
| Factory V2 (USDC / JPYC) | [View on Snowtrace](https://snowtrace.io/address/0xf72d15468a94871150AEDa9371060bf21783f3a7) |
| Paymaster | [View on Snowtrace](https://snowtrace.io/address/0x3733cC798Ca09b21528C142C97e811f2af2F9bf2) |
| USDC | [View on Snowtrace](https://snowtrace.io/address/0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E) |
| JPYC | [View on Snowtrace](https://snowtrace.io/address/0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29) |

---

# What Makes BitVoy Unique

BitVoy focuses on **real-world payment usability**, not only wallet functionality.

Key innovations include:

- **OIDC-based wallet authentication**
- **Intent-based payment authorization**
- **MPC-secured non-custodial wallet architecture**
- **High-speed checkout optimized for Avalanche**

Our goal is to enable **the fastest blockchain checkout experience for e-commerce platforms**.

---

# Merchant Integration Vision

BitVoy is designed to integrate with:

- Shopify
- E-commerce platforms
- SIer enterprise integrations

This allows merchants to accept **stablecoin payments (JPYC / USDC)** with minimal friction.

---

# Future Direction

BitVoy will continue optimizing payment speed using Avalanche infrastructure, including:

- Avalanche subnet optimization
- Fee control mechanisms
- Payment-specific transaction pipelines

The ultimate goal is to achieve **the fastest on-chain payment experience in the world**.
