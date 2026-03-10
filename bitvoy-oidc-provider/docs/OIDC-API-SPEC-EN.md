# BitVoy OIDC API Specification v1.10

---

## Table of Contents

1. [Overview](#1-overview)
2. [OIDC Login API](#2-oidc-login-api)
3. [OIDC Payment API](#3-oidc-payment-api)
4. [OIDC Link API](#4-oidc-link-api)
5. [Common Specifications](#5-common-specifications)
6. [Error Handling](#6-error-handling)
7. [Security](#7-security)

---

# 1. Overview

The BitVoy OIDC API is an authentication and authorization system compliant with the **OpenID Connect (OIDC)** standard.

It provides the following three primary features:

- **OIDC Login** — Standard OIDC authentication login
- **OIDC Payment** — OIDC authentication combined with crypto payment (JPYC / USDC)
- **OIDC Link** — OIDC authentication including wallet address verification and signature

---

## Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://bitvoy.org` |
| Development | `https://dev.bitvoy.org` |

---

## Authentication Methods

- **Client Authentication**

```

client_id + client_secret

```

Supported method:

```

client_secret_post

```

(POST body only)

- **User Authentication**

```

WebAuthn (Passkey)
+
FROST MPC signature (2-of-3 threshold)

```

---

## OIDC Discovery

```

GET /.well-known/openid-configuration

```

Returns provider metadata compliant with **OpenID Connect Discovery 1.0**.

| Field | Value |
|------|------|
| issuer | https://bitvoy.org |
| authorization_endpoint | `{issuer}/oidc/authorize` |
| token_endpoint | `{issuer}/oidc/token` |
| userinfo_endpoint | `{issuer}/oidc/userinfo` |
| jwks_uri | `{issuer}/oidc/jwks` |
| introspection_endpoint | `{issuer}/oidc/introspect` |
| revocation_endpoint | `{issuer}/oidc/revoke` |
| end_session_endpoint | `{issuer}/oidc/logout` |
| response_types_supported | `["code"]` |
| subject_types_supported | `["pairwise"]` |
| id_token_signing_alg_values_supported | `["RS256"]` |
| scopes_supported | `["openid","profile","email","payment"]` |
| token_endpoint_auth_methods_supported | `["client_secret_post"]` |
| code_challenge_methods_supported | `["S256"]` |

---

# 2. OIDC Login API

---

## 2.1 Authorization Endpoint

```

GET /oidc/authorize

```

Starts the OIDC authentication flow.

---

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| response_type | Required | `code` |
| client_id | Required | Client ID |
| redirect_uri | Required | Registered redirect URI |
| scope | Required | Example: `openid profile email` |
| state | Required | Random value for CSRF protection |
| nonce | Recommended | Prevent replay attacks |
| code_challenge | Recommended | PKCE challenge |
| code_challenge_method | Recommended | `S256` |

---

### Response

If the user is not authenticated:

```

Redirect to /wallet/login

```

If authenticated:

```

redirect_uri?code=AUTH_CODE&state=STATE_VALUE

```

Example

```

[https://example.com/callback?code=AUTH_CODE&state=STATE_VALUE](https://example.com/callback?code=AUTH_CODE&state=STATE_VALUE)

```

---

### Flow

```

1. RP → GET /oidc/authorize
2. BitVoy → redirect /wallet/login
3. User → WebAuthn authentication
4. BitVoy → /oidc/authorize (session restored)
5. BitVoy → redirect_uri?code=xxx&state=yyy

```

---

## 2.2 Token Endpoint

```

POST /oidc/token
Content-Type: application/x-www-form-urlencoded

````

---

### Request Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| grant_type | Required | `authorization_code` |
| client_id | Required | Client ID |
| client_secret | Required | Client secret |
| code | Required | Authorization code |
| redirect_uri | Required | Same URI used in authorize |
| code_verifier | Required when PKCE | PKCE verification |

---

### Successful Response

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "id_token": "eyJ...",
  "scope": "openid profile email"
}
````

ID Token signing algorithm:

```
RS256
```

---

### Error Response

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code is invalid or expired"
}
```

---

## 2.3 UserInfo Endpoint

```
GET /oidc/userinfo
Authorization: Bearer ACCESS_TOKEN
```

---

### Successful Response

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

`sub` is a **Pairwise Subject Identifier** unique per client.

---

## 2.4 JWKS Endpoint

```
GET /oidc/jwks
```

Returns the public key set used for **RS256 ID token signature verification**.

---

## 2.5 Token Introspection

```
POST /oidc/introspect
Content-Type: application/x-www-form-urlencoded
```

| Parameter       | Required |
| --------------- | -------- |
| token           | Required |
| client_id       | Required |
| client_secret   | Required |
| token_type_hint | Optional |

---

## 2.6 Token Revocation

```
POST /oidc/revoke
```

---

## 2.7 Logout

```
GET /oidc/logout
```

| Parameter                | Required | Description           |
| ------------------------ | -------- | --------------------- |
| id_token_hint            | Optional | ID token              |
| post_logout_redirect_uri | Optional | Redirect after logout |
| state                    | Optional | CSRF protection       |

---

# 3. OIDC Payment API

This flow performs **on-chain crypto payments (JPYC / USDC)** within the OIDC authentication process.

---

## 3.1 Supported Chains

| Chain             | chain value | Currency   |
| ----------------- | ----------- | ---------- |
| Avalanche C-Chain | avalanche   | JPYC, USDC |
| Polygon           | polygon     | JPYC, USDC |
| Ethereum          | ethereum    | USDC       |

---

## 3.2 Execution Modes

| Mode                | execution_mode | Description              |
| ------------------- | -------------- | ------------------------ |
| Standard            | STANDARD       | Direct transfer from EOA |
| Account Abstraction | AA             | ERC-4337 UserOperation   |

---

## 3.3 Create Payment Intent

```
POST /oidc-payment/intents
Content-Type: application/json
```

---

### Request Parameters

| Parameter      | Required | Description                    |
| -------------- | -------- | ------------------------------ |
| rp_client_id   | Required | Client ID                      |
| client_secret  | Required | Client secret                  |
| order_ref      | Required | Merchant order reference       |
| amount         | Required | Amount                         |
| currency       | Required | JPYC / USDC                    |
| payee          | Required | Payee address                  |
| chain          | Required | avalanche / polygon / ethereum |
| execution_mode | Optional | STANDARD / AA                  |
| network        | Optional | mainnet / testnet              |
| expires_in     | Optional | Default 900 seconds            |
| return_url     | Optional | Redirect after payment         |
| metadata       | Optional | Custom JSON                    |

---

### Example Payee

```json
"payee": "0x411146a9C873ABf140CA8a37E965108a232ec81A"
```

or

```json
"payee": {
  "type": "address",
  "value": "0x411146a9C873ABf140CA8a37E965108a232ec81A"
}
```

---

### Success Response

```json
{
  "intent_id": "int_xxx",
  "status": "CREATED",
  "expires_at": "2025-03-10T09:00:00Z",
  "intent_token": "eyJ...",
  "payment_start_url": "https://bitvoy.org/oidc/authorize?...intent_id=xxx"
}
```

---

## 3.4 Check Intent Status

```
GET /oidc-payment/intents/{intent_id}
```

---

### Success Response

```json
{
  "intent_id": "int_xxx",
  "status": "SUCCEEDED",
  "tx_hash": "0xf7a41da5...",
  "chain": "avalanche"
}
```

---

### Intent Status

| Status     | Description           |
| ---------- | --------------------- |
| CREATED    | Intent created        |
| PRESENTED  | Payment UI shown      |
| AUTHORIZED | User approved         |
| PROCESSING | Transaction broadcast |
| SUCCEEDED  | Transaction confirmed |
| FAILED     | Transaction reverted  |
| EXPIRED    | Expired               |
| CANCELED   | Canceled              |

---

## 3.5 Confirmations Endpoint

```
GET /oidc-payment/intents/{intent_id}/confirmations
```

---

### Response

```json
{
  "intent_id": "int_xxx",
  "confirmations": 2,
  "required_confirmations": 12,
  "status": "PROCESSING"
}
```

Note:

Avalanche finality is fast, so **SUCCEEDED is determined after 1 confirmation**.

---

## 3.6 Payment Flow

```
1 RP → POST /oidc-payment/intents
2 RP → redirect user to payment_start_url
3 BitVoy → WebAuthn authentication
4 User → wallet confirmation
5 BitVoy → broadcast transaction
6 BitVoy → redirect return_url
7 RP → poll intent status
```

---

## 3.7 Webhook Events

| Event             | Description           |
| ----------------- | --------------------- |
| intent.created    | Intent created        |
| intent.presented  | Payment screen opened |
| intent.authorized | User approved         |
| intent.processing | Transaction sent      |
| intent.succeeded  | Payment completed     |
| intent.failed     | Payment failed        |
| intent.expired    | Intent expired        |
| intent.canceled   | Intent canceled       |

---

### Webhook Signature

```
X-Webhook-Signature:
sha256=BASE64(HMAC(payload, webhook_secret))
```

---

# 4. OIDC Link API

Allows **wallet address attestation** inside the ID Token.

---

## Authorization

```
GET /oidc/authorize?link=1&chain=avalanche
```

---

### Flow

```
1 RP → /oidc/authorize
2 BitVoy → WebAuthn
3 Wallet signature
4 POST /wallet/oidc-link
5 Continue OIDC
```

---

## Link Endpoint

```
POST /wallet/oidc-link
```

Example

```json
{
  "wallet_address": "0xCC59...",
  "wallet_signature": "0x...",
  "wallet_message": "BitVoy wallet link nonce:xxx",
  "chain": "avalanche"
}
```

---

### Additional ID Token Claims

| Claim            | Description      |
| ---------------- | ---------------- |
| wallet_address   | Wallet EOA       |
| wallet_signature | Wallet signature |
| wallet_message   | Signed message   |

---

# 5. Common Specifications

---

## Client Registration

| Field          | Description         |
| -------------- | ------------------- |
| client_id      | Client ID           |
| client_secret  | Secret              |
| redirect_uris  | Allowed redirects   |
| scopes         | Allowed scopes      |
| webhook_url    | Webhook endpoint    |
| webhook_secret | Webhook signing key |

---

## Scopes

| Scope   | Description  |
| ------- | ------------ |
| openid  | Required     |
| profile | Profile info |
| email   | Email info   |
| payment | Payment flow |

---

## PKCE (Recommended)

```
code_challenge = BASE64URL(SHA256(code_verifier))
```

---

# 6. Error Handling

| Error                  | HTTP |
| ---------------------- | ---- |
| invalid_request        | 400  |
| invalid_client         | 401  |
| invalid_grant          | 400  |
| invalid_scope          | 400  |
| invalid_amount         | 400  |
| payee_invalid          | 400  |
| intent_not_found       | 404  |
| intent_expired         | 400  |
| unsupported_grant_type | 400  |
| access_denied          | 403  |
| tx_hash_not_set        | 400  |
| server_error           | 500  |

---

### Error Format

```json
{
  "error": "error_code",
  "error_description": "description",
  "message": "optional details"
}
```

---

# 7. Security

---

## Best Practices

1. HTTPS required (TLS 1.2+)
2. Use PKCE
3. Validate state
4. Validate nonce
5. Verify ID Token signature
6. Strict redirect URI validation
7. Verify webhook signature

---

## Wallet Signature Verification

1. ECDSA verification
2. Nonce validation
3. Domain validation
4. Replay attack prevention

---

## Client Authentication

Supported:

```
client_secret_post
```

Not supported:

```
client_secret_basic
```

---

Last Updated: 2026-03-10
Version: 1.10
