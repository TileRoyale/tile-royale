import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/index.ts', 'utf8').replace(/\r\n/g, '\n');

for (const [productId, amount] of [
  ['patience_hourglass_3', 3],
  ['patience_hourglass_10', 10],
  ['patience_hourglass_20', 20],
] as const) {
  assert.match(
    source,
    new RegExp(`${productId}:\\s*\\{\\s*type:\\s*'consumable',[^\\n]*grant:\\s*\\{\\s*patienceHourglasses:\\s*${amount}\\s*\\}`),
    `${productId} must grant exactly ${amount} server-verified Patience Hourglasses`
  );
}

const verifyRouteStart = source.indexOf('app.post("/pa/iap/verify"');
const verifyRouteEnd = source.indexOf('\n});', verifyRouteStart);
assert(verifyRouteStart >= 0 && verifyRouteEnd > verifyRouteStart, 'IAP verification route missing');
const verifyRoute = source.slice(verifyRouteStart, verifyRouteEnd);
assert.match(verifyRoute, /typeof v === 'number'\) \? v \* quantity : v/, 'verified store quantity must scale numeric grants');
assert.match(verifyRoute, /recordPAPurchaseReceipt/, 'purchase receipt must be recorded before delivery');

console.log('pa-patience-hourglass-iap.test.ts passed');
