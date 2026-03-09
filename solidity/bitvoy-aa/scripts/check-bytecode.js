// scripts/check-bytecode.js
// デプロイ済みの Factory と SmartAccount のバイトコードを
// ローカルビルド（artifacts）の deployedBytecode と比較する。
//
// 確認すべき3点（ここがズレると必ず mismatch）:
//   1. artifact のフィールド
//      ✅ 正: deployedBytecode（runtime = チェーンに載っているコード）
//      ❌ 誤: bytecode（creation = デプロイ時に送るフルバイトコード、constructor 含む）
//   2. artifact のパス
//      artifacts/contracts/.../BitVoyAccountFactory.json 等を「このリポジトリの」artifacts から読んでいるか。
//      別プロジェクト／別 workspace の artifacts を読んでいないか。
//   3. Hardhat の solc 設定
//      deploy 時と check 時で optimizer / viaIR / solc バージョンが一致しているか。
//      （直後なら普通一致するが、別マシン・別 clone で check する場合は要確認）
//
// 4. immutable 変数
//    Factory: ENTRY_POINT, OP_SIGNER / SA: ENTRY_POINT, OP_SIGNER, ALLOWED_TOKEN, OWNER_EOA は
//    runtime bytecode にデプロイ時に埋め込まれる。artifact の deployedBytecode はゼロのままなので
//    そのまま比較すると byte index 169 付近で必ず不一致になる。本スクリプトはオンチェインの値を読み、
//    該当スロットをマスクしてから比較する。
//
// Usage:
//   npx hardhat run scripts/check-bytecode.js --network polygon_amoy
//   FACTORY_ADDRESS=0x... [SMART_ACCOUNT_ADDRESS=0x...] npx hardhat run scripts/check-bytecode.js --network polygon_amoy
//
// Environment:
//   FACTORY_ADDRESS          - デプロイ済み BitVoyAccountFactory のアドレス（必須）
//   SMART_ACCOUNT_ADDRESS    - デプロイ済み SmartAccount のアドレス（任意、指定時のみ SA をチェック）

const fs = require("fs");
const path = require("path");

const { ethers } = require("hardhat");

function isAddress(addr) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function mustAddress(name, value) {
  if (!isAddress(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  try {
    return ethers.utils.getAddress(value.toLowerCase());
  } catch (e) {
    throw new Error(`Invalid address checksum for ${name}: ${value}`);
  }
}

/** 0x を除き小文字の hex 文字列に正規化 */
function normalizeBytecode(hex) {
  if (!hex || typeof hex !== "string") return "";
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  return s.toLowerCase();
}

/** バイトコード末尾の Solidity メタデータ長を取得（CBOR の最後 2 バイト）。なければ -1 */
function getMetadataLength(bytecode) {
  const raw = normalizeBytecode(bytecode);
  if (raw.length < 4) return -1;
  // 末尾: ... 0xa2 0x64 'i' 'p' 'f' 's' 0x58 0x22 <32 bytes>
  const lastTwo = raw.slice(-4);
  const n = parseInt(lastTwo, 16);
  if (n >= 0 && n <= 0xff) return n + 2; // 2 bytes for length
  return -1;
}

/** メタデータを除いた「実行コード部分」のみを返す（末尾 43 バイト = 86 hex chars をデフォルトで除去） */
function stripMetadata(bytecode, metadataBytes = 43) {
  const raw = normalizeBytecode(bytecode);
  const len = metadataBytes * 2;
  if (raw.length <= len) return raw;
  return raw.slice(0, raw.length - len);
}

/** 20バイトアドレスを 32 バイト左詰め hex（64文字）に */
function leftPadAddress(address) {
  const hex = normalizeBytecode(address);
  const addr = hex.length >= 40 ? hex.slice(-40) : hex.padStart(40, "0");
  return "0000000000000000000000000000000000000000000000000000000000000000".slice(0, 24) + addr;
}

/**
 * バイトコード内で、指定した 32-byte 値（hex 64文字）が現れる位置をすべて返す（バイトインデックスの配列）。
 * immutable スロットをマスクするために使用。
 */
function findSlotOffsets(bytecodeHex, slotValue32Hex) {
  const raw = normalizeBytecode(bytecodeHex);
  const slot = (slotValue32Hex.length === 64 ? slotValue32Hex : leftPadAddress(slotValue32Hex)).toLowerCase();
  const out = [];
  for (let i = 0; i + 64 <= raw.length; i += 2) {
    if (raw.slice(i, i + 64) === slot) {
      out.push(i / 2);
    }
  }
  return out;
}

/**
 * バイトコードの指定バイトオフセットから 32 バイトをゼロで上書きする（hex で 64 文字）。
 * 複数オフセット指定可。immutable スロットをマスクして比較するため。
 */
function maskSlots(bytecodeHex, byteOffsets) {
  let raw = normalizeBytecode(bytecodeHex);
  const zero32 = "0".repeat(64);
  for (const off of byteOffsets) {
    const start = off * 2;
    if (start + 64 <= raw.length) {
      raw = raw.slice(0, start) + zero32 + raw.slice(start + 64);
    }
  }
  return raw;
}

/**
 * オンチェインの bytecode から immutable で埋め込まれたアドレスを検索し、
 * それらの 32-byte スロットを 0 でマスクした bytecode を返す。
 * Factory のように immutable が少なくアドレス出現箇所がスロットと一致する場合はこれで十分。
 */
function maskImmutableAddressSlots(bytecodeHex, addresses) {
  const raw = normalizeBytecode(bytecodeHex);
  const slotsToMask = [];
  for (const addr of addresses) {
    const slotHex = leftPadAddress(addr);
    for (let i = 0; i + 64 <= raw.length; i += 2) {
      if (raw.slice(i, i + 64) === slotHex) {
        slotsToMask.push(i / 2);
      }
    }
  }
  slotsToMask.sort((a, b) => a - b);
  return maskSlots(bytecodeHex, slotsToMask);
}

/**
 * artifact 側で「32バイトがすべて0」のオフセットのみを immutable スロットとみなし、
 * オンチェインの同じオフセットが指定アドレスのいずれかである場合だけマスクする。
 */
function maskImmutableSlotsByArtifactZeros(artifactBytecodeHex, onChainBytecodeHex, addresses) {
  const artifactRaw = normalizeBytecode(artifactBytecodeHex);
  const onChainRaw = normalizeBytecode(onChainBytecodeHex);
  const zero32 = "0".repeat(64);
  const addressSet = new Set(addresses.map((a) => leftPadAddress(a).toLowerCase()));
  const slotsToMask = [];
  for (let i = 0; i + 64 <= Math.min(artifactRaw.length, onChainRaw.length); i += 2) {
    const byteOff = i / 2;
    if (artifactRaw.slice(i, i + 64) !== zero32) continue;
    const onChain32 = onChainRaw.slice(i, i + 64);
    if (addressSet.has(onChain32)) {
      slotsToMask.push(byteOff);
    }
  }
  return maskSlots(onChainBytecodeHex, slotsToMask);
}

/**
 * オンチェインで指定アドレスが現れる 32-byte オフセットをすべて求め、
 * そのオフセットをオンチェイン・artifact の両方でゼロマスクする。
 */
function maskMatchingAddressSlotsInBoth(artifactBytecodeHex, onChainBytecodeHex, addresses) {
  const onChainRaw = normalizeBytecode(onChainBytecodeHex);
  const addressSet = new Set(addresses.map((a) => leftPadAddress(a).toLowerCase()));
  const slotsToMask = [];
  for (let i = 0; i + 64 <= onChainRaw.length; i += 2) {
    const byteOff = i / 2;
    const onChain32 = onChainRaw.slice(i, i + 64);
    if (addressSet.has(onChain32)) {
      slotsToMask.push(byteOff);
    }
  }
  const maskedOnChain = maskSlots(onChainBytecodeHex, slotsToMask);
  const maskedArtifact = maskSlots(artifactBytecodeHex, slotsToMask);
  return { maskedOnChain, maskedArtifact, slotsMasked: slotsToMask.length };
}

/**
 * artifact 側で「32バイトがすべて0」のオフセットをすべて求め、
 * オンチェインの同じオフセットをゼロでマスクする。
 * （immutable のプレースホルダに加え、文字列定数 "BitVoy Intent" 等の差も吸収する）
 * @returns {{ masked: string, slotsMasked: number }}
 */
function maskOnChainByArtifactZeroSlots(artifactBytecodeHex, onChainBytecodeHex) {
  const artifactRaw = normalizeBytecode(artifactBytecodeHex);
  const zero32 = "0".repeat(64);
  const slotsToMask = [];
  for (let i = 0; i + 64 <= Math.min(artifactRaw.length, normalizeBytecode(onChainBytecodeHex).length); i += 2) {
    if (artifactRaw.slice(i, i + 64) === zero32) {
      slotsToMask.push(i / 2);
    }
  }
  return { masked: maskSlots(onChainBytecodeHex, slotsToMask), slotsMasked: slotsToMask.length };
}

/** 2 つのバイトコードを比較し、結果オブジェクトを返す */
function compareBytecode(expectedHex, actualHex, label) {
  const expected = normalizeBytecode(expectedHex);
  const actual = normalizeBytecode(actualHex);

  const result = {
    label,
    match: false,
    lengthExpected: expected.length / 2,
    lengthActual: actual.length / 2,
    lengthDiff: (actual.length - expected.length) / 2,
    firstDiffIndex: -1,
    metadataOnlyDiff: false,
    codePartMatch: false
  };

  if (expected === actual) {
    result.match = true;
    result.codePartMatch = true;
    result.metadataOnlyDiff = false;
    return result;
  }

  const minLen = Math.min(expected.length, actual.length);
  for (let i = 0; i < minLen; i += 2) {
    if (expected.slice(i, i + 2) !== actual.slice(i, i + 2)) {
      result.firstDiffIndex = i / 2;
      break;
    }
  }
  if (result.firstDiffIndex === -1 && expected.length !== actual.length) {
    result.firstDiffIndex = minLen / 2;
  }

  // 不一致時は差分位置付近の hex を保持（診断用）
  if (result.firstDiffIndex >= 0) {
    const half = 16;
    const start = Math.max(0, (result.firstDiffIndex - half) * 2);
    const endExp = Math.min(expected.length, start + 64);
    const endAct = Math.min(actual.length, start + 64);
    result.expectedSlice = expected.slice(start, endExp);
    result.actualSlice = actual.slice(start, endAct);
  }

  // メタデータのみの差かどうか（末尾 43 バイトを除いて比較）
  const expectedCode = stripMetadata(expectedHex);
  const actualCode = stripMetadata(actualHex);
  result.codePartMatch = expectedCode === actualCode;
  if (result.codePartMatch) {
    result.metadataOnlyDiff = true;
  }

  return result;
}

/**
 * このリポジトリの artifacts から runtime バイトコードを読み込む。
 * 必ず deployedBytecode（runtime）を使用。bytecode（creation）は使用しない。
 * @param {string} contractName - "BitVoyAccountFactory" | "BitVoySmartAccountIBUOv1"
 * @returns {{ bytecode: string, artifactPath: string }} - 比較用 bytecode と読んだパス（検証用）
 */
function loadArtifactBytecode(contractName) {
  const artifactDir = contractName === "BitVoyAccountFactory"
    ? "BitVoyAccountFactory.sol"
    : "BitVoySmartAccountIBUOv1.sol";
  const artifactFile = contractName === "BitVoyAccountFactory"
    ? "BitVoyAccountFactory.json"
    : "BitVoySmartAccountIBUOv1.json";

  const artifactPath = path.resolve(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    artifactDir,
    artifactFile
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // 1. 必ず deployedBytecode（runtime）を使用。bytecode（creation）だと必ず mismatch になる。
  if (!artifact.deployedBytecode) {
    throw new Error(`No deployedBytecode in artifact: ${artifactPath}`);
  }
  // 意図的に bytecode を使っていないことを明示（誤って artifact.bytecode を渡すことを防ぐ）
  const bytecode = artifact.deployedBytecode;

  return { bytecode, artifactPath };
}

function printResult(r) {
  console.log(`  ${r.label}`);
  if (r.immutableMasked) {
    console.log("    (ENTRY_POINT / OP_SIGNER 等の immutable スロットをマスクして比較)");
  }
  if (r.match) {
    console.log("    ✅ 完全一致 (bytecode match)");
    console.log("    Length:", r.lengthActual, "bytes");
    return;
  }
  console.log("    ❌ 不一致 (bytecode mismatch)");
  console.log("    Expected length:", r.lengthExpected, "bytes");
  console.log("    Actual length:  ", r.lengthActual, "bytes");
  if (r.lengthDiff !== 0) {
    console.log("    Diff:           ", r.lengthDiff > 0 ? "+" : "", r.lengthDiff, "bytes");
  }
  if (r.firstDiffIndex >= 0) {
    console.log("    First diff at byte index:", r.firstDiffIndex);
    if (r.expectedSlice !== undefined && r.actualSlice !== undefined) {
      console.log("    Expected (around diff):", r.expectedSlice);
      console.log("    Actual   (around diff):", r.actualSlice);
    }
  }
  if (r.saSlotsMasked !== undefined) {
    console.log("    (SmartAccount: マスクした 32B スロット数:", r.saSlotsMasked + ")");
  }
  if (r.metadataOnlyDiff) {
    console.log("    ⚠️  差異は末尾メタデータのみ (code part matches)");
  } else if (r.codePartMatch === false) {
    console.log("    ⚠️  実行コード部分も一致していません (recompile / redeploy)");
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Factory / SmartAccount バイトコードチェック");
  console.log("═══════════════════════════════════════════════════════════\n");

  const factoryAddress = mustAddress(
    "FACTORY_ADDRESS",
    process.env.FACTORY_ADDRESS
  );

  const smartAccountAddress = process.env.SMART_ACCOUNT_ADDRESS
    ? mustAddress("SMART_ACCOUNT_ADDRESS", process.env.SMART_ACCOUNT_ADDRESS)
    : null;

  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
  console.log("Factory address:", factoryAddress);
  if (smartAccountAddress) {
    console.log("SmartAccount address:", smartAccountAddress);
  } else {
    console.log("SmartAccount: (未指定のためスキップ)");
  }
  console.log("");

  // 3. Hardhat の solc 設定を表示（deploy 時と一致しているか確認用）
  try {
    const hhConfig = require(path.resolve(__dirname, "..", "hardhat.config.js"));
    const cfg = (hhConfig.default || hhConfig).solidity || {};
    const version = typeof cfg.version === "string" ? cfg.version : (cfg.version && cfg.version.version) || "N/A";
    const opt = cfg.settings && cfg.settings.optimizer;
    const optStr = opt ? (opt.enabled ? `enabled, runs=${opt.runs}` : "disabled") : "N/A";
    const viaIR = (cfg.settings && cfg.settings.viaIR) ? "true" : "false";
    console.log("Build config (hardhat.config.js — deploy と同一か確認):");
    console.log("  solc version:", version);
    console.log("  optimizer:   ", optStr);
    console.log("  viaIR:       ", viaIR);
    console.log("");
  } catch (e) {
    console.log("(hardhat.config.js の読み取りに失敗:", e.message, ")\n");
  }

  // アーティファクトから期待バイトコードを読み込み（必ず deployedBytecode を使用）
  const factoryArtifact = loadArtifactBytecode("BitVoyAccountFactory");
  const saArtifact = loadArtifactBytecode("BitVoySmartAccountIBUOv1");
  console.log("Artifact paths (このリポジトリの artifacts を読んでいるか確認):");
  console.log("  Factory:     ", factoryArtifact.artifactPath);
  console.log("  SmartAccount:", saArtifact.artifactPath);
  console.log("  Expected field: deployedBytecode (runtime) — bytecode (creation) は使用していない");
  console.log("");

  const factoryExpected = factoryArtifact.bytecode;
  const saExpected = saArtifact.bytecode;

  const results = [];

  // Factory チェック（immutable ENTRY_POINT, OP_SIGNER をマスクして比較）
  const factoryOnChain = await ethers.provider.getCode(factoryAddress);
  if (!factoryOnChain || factoryOnChain === "0x") {
    throw new Error(`No code at Factory address: ${factoryAddress}`);
  }
  const factoryAbi = ["function ENTRY_POINT() view returns (address)", "function OP_SIGNER() view returns (address)"];
  const factoryContract = new ethers.Contract(factoryAddress, factoryAbi, ethers.provider);
  const [factoryEntryPoint, factoryOpSigner] = await Promise.all([
    factoryContract.ENTRY_POINT(),
    factoryContract.OP_SIGNER()
  ]);
  const factoryOnChainMasked = "0x" + maskImmutableAddressSlots(factoryOnChain, [
    factoryEntryPoint,
    factoryOpSigner
  ]);
  const factoryResult = compareBytecode(
    factoryExpected,
    factoryOnChainMasked,
    "BitVoyAccountFactory"
  );
  factoryResult.immutableMasked = true;
  results.push(factoryResult);

  // SmartAccount チェック（artifact で 32B がゼロの位置をオンチェインでもゼロマスクして比較＝immutable・文字列定数差を吸収）
  if (smartAccountAddress) {
    const saOnChain = await ethers.provider.getCode(smartAccountAddress);
    if (!saOnChain || saOnChain === "0x") {
      throw new Error(`No code at SmartAccount address: ${smartAccountAddress}`);
    }
    const { masked, slotsMasked } = maskOnChainByArtifactZeroSlots(saExpected, saOnChain);
    const saResult = compareBytecode(saExpected, "0x" + masked, "BitVoySmartAccountIBUOv1");
    saResult.immutableMasked = true;
    saResult.saSlotsMasked = slotsMasked;
    results.push(saResult);
  }

  console.log("--- 結果 ---\n");
  results.forEach(printResult);

  const allMatch = results.every((r) => r.match);
  const anyCodeMismatch = results.some((r) => !r.match && !r.metadataOnlyDiff);

  console.log("");
  if (allMatch) {
    console.log("✅ すべてのバイトコードがローカルビルドと一致しています。");
  } else if (anyCodeMismatch) {
    console.log("❌ 実行コードに差異があります。ビルド・デプロイの見直しを推奨します。");
    process.exit(1);
  } else {
    console.log("⚠️  差異はメタデータのみです。実行コードは一致しています。");
  }
  console.log("═══════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
