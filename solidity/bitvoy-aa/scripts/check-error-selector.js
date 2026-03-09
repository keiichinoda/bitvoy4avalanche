/**
 * エラーセレクター 0xdb44b7f7 がどのカスタムエラーに対応するか確認
 */

const crypto = require('crypto');

// SmartAccountのカスタムエラー
const saErrors = [
  'OnlyEntryPoint()',
  'PaymasterRequired()',
  'InvalidAuthType()',
  'InvalidSignature()',
  'InvalidUserSigV()',
  'InvalidOpSigV()',
  'InvalidCallData()',
  'TokenNotAllowed()',
  'ChainMismatch()',
  'TooEarly()',
  'Expired()',
  'IntentAlreadyUsed()',
  'InvalidOpSigLength()',
  'InvalidOpSignature()'
];

// Paymasterのカスタムエラー
const pmErrors = [
  'InvalidPaymasterAndData()',
  'InvalidSignature()',
  'SenderNotAllowed()'
];

// EntryPointのFailedOp
const entryPointErrors = [
  'FailedOp(uint256,string)'
];

const targetSelector = '0xdb44b7f7';

function calculateErrorSelector(errorName) {
  // keccak256("ErrorName()") の最初の4バイト
  const hash = crypto.createHash('sha3-256').update(errorName).digest('hex');
  return '0x' + hash.substring(0, 8);
}

console.log('🔍 エラーセレクター 0xdb44b7f7 のマッチング確認\n');

console.log('📋 SmartAccount カスタムエラー:');
let foundMatch = false;
saErrors.forEach(errorName => {
  const selector = calculateErrorSelector(errorName);
  const match = selector.toLowerCase() === targetSelector.toLowerCase();
  if (match) {
    foundMatch = true;
    console.log(`  ✅ ${errorName.padEnd(25)} => ${selector} <-- MATCH!`);
  } else {
    console.log(`     ${errorName.padEnd(25)} => ${selector}`);
  }
});

console.log('\n📋 Paymaster カスタムエラー:');
pmErrors.forEach(errorName => {
  const selector = calculateErrorSelector(errorName);
  const match = selector.toLowerCase() === targetSelector.toLowerCase();
  if (match) {
    foundMatch = true;
    console.log(`  ✅ ${errorName.padEnd(25)} => ${selector} <-- MATCH!`);
  } else {
    console.log(`     ${errorName.padEnd(25)} => ${selector}`);
  }
});

console.log('\n📋 EntryPoint エラー:');
entryPointErrors.forEach(errorName => {
  const selector = calculateErrorSelector(errorName);
  const match = selector.toLowerCase() === targetSelector.toLowerCase();
  if (match) {
    foundMatch = true;
    console.log(`  ✅ ${errorName.padEnd(25)} => ${selector} <-- MATCH!`);
  } else {
    console.log(`     ${errorName.padEnd(25)} => ${selector}`);
  }
});

if (!foundMatch) {
  console.log('\n❌ マッチするエラーが見つかりませんでした');
  console.log('   0xdb44b7f7 は EntryPoint の FailedOp の別バージョンかもしれません');
}

