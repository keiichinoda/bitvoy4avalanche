# BitVoy OIDC API 仕様書 v1.10

---

## 目次

1. [概要](#1-概要)
2. [OIDC Login API](#2-oidc-login-api)
3. [OIDC Payment API](#3-oidc-payment-api)
4. [OIDC Link API](#4-oidc-link-api)
5. [共通仕様](#5-共通仕様)
6. [エラーハンドリング](#6-エラーハンドリング)
7. [セキュリティ](#7-セキュリティ)

---

## 1. 概要

BitVoy OIDC API は、OpenID Connect（OIDC）標準に準拠した認証・認可システムです。以下の3つの主要機能を提供します。

- **OIDC Login**: 標準的な OIDC 認証によるログイン機能
- **OIDC Payment**: 暗号資産決済（JPYC / USDC）を伴う OIDC 認証
- **OIDC Link**: ウォレットアドレスと署名を含む OIDC 認証

### ベース URL

| 環境 | URL |
|------|-----|
| 本番 | `https://bitvoy.org` |
| 開発 | `https://dev.bitvoy.org` |

### 認証方式

- **クライアント認証**: `client_id` + `client_secret`（POST body、`client_secret_post` のみ対応）
- **ユーザー認証**: WebAuthn（Passkey）+ FROST MPC 署名（2-of-3 閾値署名）

### OIDC Discovery

```
GET /.well-known/openid-configuration
```

OpenID Connect Discovery 1.0 準拠のプロバイダーメタデータを返します。主要フィールド：

| フィールド | 値 |
|-----------|-----|
| `issuer` | `https://bitvoy.org` |
| `authorization_endpoint` | `{issuer}/oidc/authorize` |
| `token_endpoint` | `{issuer}/oidc/token` |
| `userinfo_endpoint` | `{issuer}/oidc/userinfo` |
| `jwks_uri` | `{issuer}/oidc/jwks` |
| `introspection_endpoint` | `{issuer}/oidc/introspect` |
| `revocation_endpoint` | `{issuer}/oidc/revoke` |
| `end_session_endpoint` | `{issuer}/oidc/logout` |
| `response_types_supported` | `["code"]` |
| `subject_types_supported` | `["pairwise"]` |
| `id_token_signing_alg_values_supported` | `["RS256"]` |
| `scopes_supported` | `["openid", "profile", "email", "payment"]` |
| `token_endpoint_auth_methods_supported` | `["client_secret_post"]` |
| `code_challenge_methods_supported` | `["S256"]` |

---

## 2. OIDC Login API

### 2.1 認証エンドポイント

```
GET /oidc/authorize
```

OIDC 認証フローを開始します。

#### クエリパラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `response_type` | 必須 | `code`（固定） |
| `client_id` | 必須 | クライアントID |
| `redirect_uri` | 必須 | 登録済みリダイレクト URI |
| `scope` | 必須 | 例：`openid profile email` |
| `state` | 必須 | CSRF 対策用ランダム値 |
| `nonce` | 推奨 | リプレイ攻撃対策 |
| `code_challenge` | 推奨 | PKCE チャレンジ（Base64url エンコード） |
| `code_challenge_method` | 推奨 | `S256` 推奨 |

#### レスポンス

- **未認証時**: `/wallet/login` にリダイレクト（WebAuthn 認証画面）
- **認証済み時**: `redirect_uri` に `code` と `state` を付与してリダイレクト

```
https://example.com/callback?code=AUTH_CODE&state=STATE_VALUE
```

#### フロー

```
1. RP → GET /oidc/authorize
2. BitVoy → /wallet/login にリダイレクト
3. ユーザー → WebAuthn（Passkey）認証
4. BitVoy → /oidc/authorize（セッショントークン付き）
5. BitVoy → redirect_uri?code=xxx&state=yyy
```

---

### 2.2 トークンエンドポイント

```
POST /oidc/token
Content-Type: application/x-www-form-urlencoded
```

#### リクエストパラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `grant_type` | 必須 | `authorization_code` |
| `client_id` | 必須 | クライアントID |
| `client_secret` | 必須 | クライアントシークレット |
| `code` | 必須 | 認証コード（有効期限 10分） |
| `redirect_uri` | 必須 | 認証時に使用した URI |
| `code_verifier` | PKCE使用時必須 | PKCE 検証用 |

> **注意**: クライアント認証は `client_secret_post`（POST body）のみ対応。Basic 認証ヘッダーは非対応。

#### 成功レスポンス

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "id_token": "eyJ...",
  "scope": "openid profile email"
}
```

ID トークンのアルゴリズム: **RS256**（非対称鍵）

#### エラーレスポンス

```json
{
  "error": "invalid_grant",
  "error_description": "認証コードが無効または期限切れです"
}
```

---

### 2.3 UserInfo エンドポイント

```
GET /oidc/userinfo
Authorization: Bearer ACCESS_TOKEN
```

#### 成功レスポンス

```json
{
  "sub": "pairwise_subject_identifier",
  "name": "bv1d5ee987dd",
  "email": "user@example.com",
  "email_verified": false,
  "picture": "https://bitvoy.org/avatar/user.jpg",
  "locale": "ja"
}
```

> `sub` は Pairwise Subject Identifier（クライアントごとに異なる識別子）

---

### 2.4 JWKS エンドポイント

```
GET /oidc/jwks
```

ID トークン署名検証用の公開鍵（RS256）を JWK Set 形式で返します。

---

### 2.5 トークンイントロスペクション

```
POST /oidc/introspect
Content-Type: application/x-www-form-urlencoded
```

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `token` | 必須 | 検証対象のアクセストークン |
| `client_id` | 必須 | クライアントID |
| `client_secret` | 必須 | クライアントシークレット |
| `token_type_hint` | 任意 | `access_token` 等 |

---

### 2.6 トークン失効

```
POST /oidc/revoke
Content-Type: application/x-www-form-urlencoded
```

---

### 2.7 ログアウト

```
GET /oidc/logout
```

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `id_token_hint` | 任意 | ID トークン |
| `post_logout_redirect_uri` | 任意 | ログアウト後のリダイレクト先 |
| `state` | 任意 | CSRF 対策用 |

---

## 3. OIDC Payment API

暗号資産（JPYC / USDC）でのオンチェーン決済を伴う OIDC 認証フローです。

### 3.1 対応チェーン・通貨

| チェーン | `chain` 値 | 対応通貨 |
|---------|-----------|---------|
| Avalanche C-Chain | `avalanche` | JPYC, USDC |
| Polygon | `polygon` | JPYC, USDC |
| Ethereum | `ethereum` | USDC |

### 3.2 実行モード

| モード | `execution_mode` | 説明 |
|--------|----------------|------|
| Standard | `STANDARD`（デフォルト） | EOA から直接送金。ガス代はユーザー負担。 |
| Account Abstraction | `AA` | ERC-4337 UserOp 経由。Paymaster がガスをスポンサー。 |

---

### 3.3 Intent 発行エンドポイント

```
POST /oidc-payment/intents
Content-Type: application/json
```

#### リクエストパラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `rp_client_id` | 必須 | クライアントID |
| `client_secret` | 必須 | クライアントシークレット |
| `order_ref` | 必須 | RP 側の注文参照番号（任意文字列） |
| `amount` | 必須 | 金額（文字列または数値。小数点可） |
| `currency` | 必須 | `JPYC` / `USDC` |
| `payee` | 必須 | 受取人（文字列アドレス、または `{type, value}` オブジェクト） |
| `chain` | 必須 | `avalanche` / `polygon` / `ethereum` |
| `execution_mode` | 任意 | `STANDARD`（デフォルト）/ `AA` |
| `network` | 任意 | `mainnet`（デフォルト）/ `testnet` |
| `expires_in` | 任意 | 有効期限（秒、デフォルト: **900秒 = 15分**） |
| `return_url` | 任意 | 支払い完了後のリダイレクト URL（登録済み redirect_uri と一致必須） |
| `metadata` | 任意 | 追加情報（任意 JSON オブジェクト） |

`payee` の指定例：
```json
// 文字列形式
"payee": "0x411146a9C873ABf140CA8a37E965108a232ec81A"

// オブジェクト形式
"payee": { "type": "address", "value": "0x411146a9C873ABf140CA8a37E965108a232ec81A" }
```

#### 成功レスポンス

```json
{
  "intent_id": "int_01KK8VGFWGNQ62CAB3MA1N69B7",
  "status": "CREATED",
  "expires_at": "2025-03-10T09:00:00.000Z",
  "intent_token": "eyJ...",
  "payment_start_url": "https://bitvoy.org/oidc/authorize?response_type=code&client_id=xxx&scope=openid+payment&intent_id=int_xxx&redirect_uri=xxx"
}
```

> `payment_start_url` を使ってユーザーを BitVoy 認証・支払い画面にリダイレクトします。

---

### 3.4 Intent 状態確認

```
GET /oidc-payment/intents/{intent_id}
Authorization: Basic BASE64(client_id:)
```

または

```
GET /oidc-payment/intents/{intent_id}?client_id={client_id}
```

> `Authorization` ヘッダー（Basic 認証、パスワードは空）推奨。クエリパラメータは後方互換のため対応。

#### 成功レスポンス（SUCCEEDED 時）

```json
{
  "intent_id": "int_01KK8VGFWGNQ62CAB3MA1N69B7",
  "status": "SUCCEEDED",
  "amount": "100",
  "currency": "JPYC",
  "chain": "avalanche",
  "order_ref": "ORDER-12345",
  "payee": {
    "type": "address",
    "address": "0x411146a9C873ABf140CA8a37E965108a232ec81A"
  },
  "execution_mode": "STANDARD",
  "expires_at": "2025-03-10T09:00:00.000Z",
  "created_at": "2025-03-10T08:30:00.000Z",
  "result": {
    "paid_at": "2025-03-10T08:31:00.000Z",
    "tx_hash": "0xf7a41da56eb6b4b276bc3c7d84d94d6944cc8fc901120463511c210ae89fd4a1",
    "chain": "avalanche",
    "paid_amount": "100"
  }
}
```

#### 成功レスポンス（FAILED 時）

```json
{
  "intent_id": "int_xxx",
  "status": "FAILED",
  "fail_code": "transaction_reverted",
  "fail_reason": "トランザクションがrevertされました"
}
```

#### Intent ステータス値

| ステータス | 説明 |
|-----------|------|
| `CREATED` | Intent 発行済み、ユーザー未操作 |
| `PRESENTED` | ユーザーが支払い画面を表示 |
| `AUTHORIZED` | ユーザーが WebAuthn 認証・支払い承認完了 |
| `PROCESSING` | トランザクション送信済み、チェーン確認待ち |
| `SUCCEEDED` | 1ブロック以上の確認が取れた（完了） |
| `FAILED` | 送金失敗またはトランザクション revert |
| `EXPIRED` | 有効期限切れ |
| `CANCELED` | キャンセル |

---

### 3.5 確認数確認エンドポイント

```
GET /oidc-payment/intents/{intent_id}/confirmations
Authorization: Basic BASE64(client_id:)
```

または

```
GET /oidc-payment/intents/{intent_id}/confirmations?client_id={client_id}
```

#### 成功レスポンス

```json
{
  "intent_id": "int_xxx",
  "confirmations": 2,
  "required_confirmations": 12,
  "status": "PROCESSING"
}
```

> **注意**: `required_confirmations: 12` は参考値です。実際の SUCCEEDED 判定は **1ブロック確認**で行われます（Avalanche は高速ファイナリティのため）。

`status` フィールドの値：

| 値 | 意味 |
|----|------|
| `PENDING` | `tx_hash` はあるが receipt 未取得 |
| `PROCESSING` | receipt 取得済み（1確認以上） |
| `SUCCEEDED` | バックグラウンドループが SUCCEEDED 判定済み |
| `FAILED` | トランザクション revert |

---

### 3.6 支払い認証フロー

```
1. RP → POST /oidc-payment/intents
         ← intent_id, payment_start_url

2. RP → ユーザーを payment_start_url にリダイレクト
         (GET /oidc/authorize?intent_id=xxx&scope=openid+payment&...)

3. BitVoy → WebAuthn 認証

4. BitVoy → ウォレット UI で送金確認・署名
             [STANDARD] EOA から ERC20 送金
             [AA]       ERC-4337 UserOp → Pimlico Bundler → チェーン実行

5. BitVoy → return_url にリダイレクト（txid 付き）

6. RP → GET /oidc/token（認証コード交換）

7. RP → GET /oidc-payment/intents/{intent_id}
         または
         GET /oidc-payment/intents/{intent_id}/confirmations
         をポーリングして SUCCEEDED を確認
```

---

### 3.7 Webhook 通知

Intent のステータス変化時に、登録された `webhook_url` へ POST 通知します。

#### イベント一覧

| イベント | タイミング |
|---------|-----------|
| `intent.created` | Intent 発行時 |
| `intent.presented` | ユーザーが支払い画面を表示した時 |
| `intent.authorized` | ユーザーが支払いを承認した時 |
| `intent.processing` | トランザクション送信・receipt 取得時 |
| `intent.succeeded` | 支払い確認完了時 |
| `intent.failed` | 支払い失敗時 |
| `intent.expired` | 有効期限切れ時 |
| `intent.canceled` | キャンセル時 |

#### Webhook ペイロード例（`intent.succeeded`）

```json
{
  "event": "intent.succeeded",
  "timestamp": "2025-03-10T08:31:00.000Z",
  "intent": {
    "intent_id": "int_01KK8VGFWGNQ62CAB3MA1N69B7",
    "status": "SUCCEEDED",
    "order_ref": "ORDER-12345",
    "amount": "100000000000000000000",
    "currency": "JPYC",
    "chain": "avalanche",
    "network": "mainnet",
    "payee": {
      "type": "address",
      "address": "0x411146a9C873ABf140CA8a37E965108a232ec81A"
    },
    "created_at": "2025-03-10T08:30:00.000Z",
    "expires_at": "2025-03-10T08:45:00.000Z",
    "result": {
      "paid_at": "2025-03-10T08:31:00.000Z",
      "tx_hash": "0xf7a41da5...",
      "chain": "avalanche",
      "network": "mainnet",
      "paid_amount": "100000000000000000000"
    }
  }
}
```

> Webhook ペイロード内の `amount`、`paid_amount` は minor unit（JPYC: 18桁、USDC: 6桁）です。

#### Webhook 署名検証

`webhook_secret` が設定されている場合、リクエストヘッダーに HMAC-SHA256 署名が付与されます：

```
X-Webhook-Signature: sha256=BASE64(HMAC-SHA256(payload, webhook_secret))
```

---

## 4. OIDC Link API

ウォレットアドレスと署名をIDトークンに含めるモードです。

### 4.1 認証（Link モード）

```
GET /oidc/authorize?link=1&chain=avalanche&...（標準 OIDC パラメータ）
```

#### フロー

```
1. RP → GET /oidc/authorize?link=1&chain=avalanche&...
2. BitVoy → WebAuthn 認証
3. ウォレット接続確認・署名
4. POST /wallet/oidc-link
5. BitVoy → /oidc/authorize（認証継続）
6. BitVoy → redirect_uri?code=xxx&state=yyy
```

---

### 4.2 OIDC Link 送信エンドポイント

このエンドポイントはウォレット UI から内部的に呼び出されます。RP が直接呼び出すことは通常ありません。

```
POST /wallet/oidc-link
Content-Type: application/json
```

```json
{
  "master_id": "btv_1d5ee987dd798025",
  "wallet_address": "0xCC59d0e306f451906b0e34DCb8AF3419ff16B47f",
  "wallet_signature": "0x...",
  "wallet_message": "BitVoy wallet link nonce:xxx",
  "chain": "avalanche",
  "session_token": "eyJ..."
}
```

#### 成功レスポンス

```json
{
  "success": true,
  "redirect_url": "/oidc/authorize?..."
}
```

---

### 4.3 Link モード ID トークン追加クレーム

Link モード成功時、ID トークンに以下のクレームが追加されます。

| クレーム | 説明 |
|---------|------|
| `wallet_address` | ウォレットのEOAアドレス |
| `wallet_signature` | ウォレット署名 |
| `wallet_message` | 署名対象メッセージ |

---

## 5. 共通仕様

### クライアント登録情報

| フィールド | 説明 |
|-----------|------|
| `client_id` | クライアントID |
| `client_secret` | クライアントシークレット |
| `redirect_uris` | 許可リダイレクト URI リスト |
| `scopes` | 許可スコープ |
| `webhook_url` | Webhook 通知先 URL（任意） |
| `webhook_secret` | Webhook 署名シークレット（任意） |

---

### スコープ

| スコープ | 説明 |
|---------|------|
| `openid` | 必須。ID トークン発行 |
| `profile` | ユーザープロフィール（`name`, `picture`, `locale`） |
| `email` | メールアドレス（`email`, `email_verified`） |
| `payment` | OIDC Payment フロー（`payment` スコープ必須） |

---

### PKCE（推奨）

| パラメータ | 説明 |
|-----------|------|
| `code_challenge` | `BASE64URL(SHA256(code_verifier))` |
| `code_challenge_method` | `S256`（推奨） |
| `code_verifier` | トークン取得時に送付 |

---

### amount の単位

Intent 発行時の `amount` は人間が読める単位（例: `"100"` = 100 JPYC）で送付してください。内部では minor unit（JPYC: 18桁、USDC: 6桁）に変換して保存されます。Webhook ペイロードの `amount` / `paid_amount` は minor unit です。

---

## 6. エラーハンドリング

### エラーコード

| エラー | HTTP | 説明 |
|-------|------|------|
| `invalid_request` | 400 | リクエストパラメータ不正 |
| `invalid_client` | 401 | クライアント認証失敗 |
| `invalid_grant` | 400 | 認証コードが無効または期限切れ |
| `invalid_scope` | 400 | スコープが無効 |
| `invalid_amount` | 400 | 金額の変換・検証エラー |
| `payee_invalid` | 400 | 受取人アドレスが無効 |
| `intent_not_found` | 404 | Intent が存在しないまたはアクセス権なし |
| `intent_expired` | 400 | Intent が期限切れ |
| `unsupported_grant_type` | 400 | 非対応の grant_type |
| `access_denied` | 403 | アクセス拒否 |
| `tx_hash_not_set` | 400 | tx_hash 未設定（confirmations 取得時） |
| `server_error` | 500 | サーバー内部エラー |

### エラーレスポンス形式

```json
{
  "error": "error_code",
  "error_description": "説明文",
  "message": "詳細メッセージ（一部エンドポイント）"
}
```

---

## 7. セキュリティ

### 推奨事項

1. **HTTPS 必須** - すべての通信は TLS 1.2 以上
2. **PKCE 使用** - `code_challenge_method=S256` 推奨
3. **state 検証** - CSRF 対策のため必須
4. **nonce 検証** - リプレイ攻撃対策
5. **ID トークン署名検証** - RS256 公開鍵（`/oidc/jwks`）で検証
6. **redirect_uri 検証** - 登録済み URI と完全一致
7. **Webhook 署名検証** - `X-Webhook-Signature` ヘッダーを検証

### OIDC Link 署名検証

1. `wallet_signature` の ECDSA 署名検証（`ecrecover`）
2. `wallet_message` の改ざん検証（nonce・ドメイン含む）
3. ドメイン検証（WebAuthn RP ID と一致）
4. Nonce 検証（リプレイ攻撃対策）

### クライアント認証

トークンエンドポイント・イントロスペクション・失効エンドポイントは `client_secret_post` のみ対応です。`client_secret_basic`（Authorization ヘッダー）は非対応です。

---

*最終更新: 2026-03-10*
*バージョン: 1.10*
