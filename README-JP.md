# BitVoy — 超高速オンチェーン決済インフラ

BitVoyは、**実世界のコマースに最適化されたWeb3決済インフラ**であり、  
**ほぼ瞬時のオンチェーンチェックアウト**を実現することを目的としています。

以下の技術を組み合わせることで実現しています。

- Passkeyによる認証
- MPC（秘密分散）によるウォレットセキュリティ
- Intentベースの決済認可
- Avalancheの高速トランザクション確定

これにより、BitVoyは **EC環境に適した極めて高速なブロックチェーン決済**を可能にします。

---

# Avalanche Mainnetを使用する理由

本プロジェクトでは、**決済速度と実際のトランザクション性能**を最重要視しています。

そのため、Build Gamesの開発フェーズにおいてもネットワークは

**Avalanche C-Chain Mainnet**

を使用しており、Fujiテストネットは使用していません。

目的は以下を測定することです。

- 実際のネットワークレイテンシ
- 実際のガス挙動
- エンドツーエンドの決済実行時間

これにより、Avalancheを用いた **サブ秒レベルのオンチェーンチェックアウト体験**が実現可能かを評価しています。

---

# システムアーキテクチャ概要

BitVoyは、2つの実行モードをサポートしています。

### STANDARDモード

Avalanche向けに最適化された高速決済モードです。

特徴

- トランザクションの直接実行
- 最小限のオーバーヘッド
- 最速のチェックアウトに最適化

現在、マーチャントはこのモードを使用しています。

---

### SAモード（Account Abstraction）

ERC-4337ベースのスマートアカウント実行モードです。

特徴

- UserOperationによる実行
- Paymasterによるガススポンサー
- 高度なスマートウォレットロジック

SAモードはエコシステムとの互換性を広げるために用意されていますが、  
**最大速度を実現するため、決済ではSTANDARDモードを使用しています。**

---

# システム動作確認方法

## 1. オンボーディング

### 方法1 — 直接登録

BitVoyサイトから新規登録

https://dev.bitvoy.org

---

### 方法2 — マーチャントログイン（OIDC Login API）

OIDC認証を使用してマーチャントサイトから登録

https://memberdev.bitvoy.net

---

# 2. 入金

## SAモード

Login → Coins → **[SA] JPYC (Avalanche)**  
表示されるReceiveアドレスへ入金

---

## STANDARDモード

Login → Coins → **JPYC (Avalanche)**  
表示されるReceiveアドレスへ入金

ガス代は以下へ入金します。

AVAX (Avalanche) → Receiveアドレス

注意

- **JPYCの代わりにUSDCでも利用可能**
- 現在、**マーチャント統合はSTANDARDモードを使用**

---

# 3. 決済実行

マーチャント側のフロー

Merchant Site  
→ Membership  
→ 商品選択  
→ カートへ追加  
→ Checkout  
→ OIDC Payment開始

Checkout成功後

1. フロント側で短時間待機
2. ユーザーはマーチャントサイトへ戻る
3. マーチャントバックエンドが **Webhook通知** を受信
4. 購入履歴が自動追加される

**SAモードとSTANDARDモードのどちらも同じフローです。**

---

# API仕様

OIDC Paymentを含むAPI仕様は以下を参照してください。

英語版  
bitvoy-oidc-provider/docs/OIDC-API-SPEC-EN.md

日本語版  
bitvoy-oidc-provider/docs/OIDC-API-SPEC-JP.md

---

# スマートコントラクトアドレス

## EntryPoint（全チェーン共通）

| コントラクト | アドレス |
|---|---|---|
| ERC-4337 EntryPoint v0.6 | [View on Snowtrace](https://snowtrace.io/address/0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789) |

---

# Avalanche C-Chain Mainnet（43114）

| コントラクト | アドレス |
|---|---|
| Factory V2 (USDC / JPYC) | [View on Snowtrace](https://snowtrace.io/address/0xf72d15468a94871150AEDa9371060bf21783f3a7) |
| Paymaster | [View on Snowtrace](https://snowtrace.io/address/0x3733cC798Ca09b21528C142C97e811f2af2F9bf2) |
| USDC | [View on Snowtrace](https://snowtrace.io/address/0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E) |
| JPYC | [View on Snowtrace](https://snowtrace.io/address/0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29) |

---

# BitVoyの独自性

BitVoyは、単なるウォレットではなく、**実世界の決済利用に焦点を当てています。**

主な技術的特徴

- **OIDCベースのウォレット認証**
- **Intentベースの決済認可**
- **MPCによるノンカストディアルウォレット**
- **Avalancheに最適化された高速チェックアウト**

私たちの目標は、**ECプラットフォーム向けに世界最速レベルのブロックチェーン決済体験を実現すること**です。

---

# マーチャント統合ビジョン

BitVoyは以下の統合を想定しています。

- Shopify
- ECプラットフォーム
- SIerによるエンタープライズ導入

これにより、マーチャントは

**JPYC / USDCなどのステーブルコイン決済**

を簡単に受け入れることができます。

---

# 今後の方向性

BitVoyはAvalancheインフラを活用し、さらなる高速化を進めていきます。

例

- Avalanche Subnetの最適化
- 手数料コントロール
- 決済特化トランザクションパイプライン

最終目標は

**世界最速のオンチェーン決済体験の実現**

です。
