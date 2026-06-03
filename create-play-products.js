/**
 * Google Play — Create In-App Products
 *
 * Setup:
 *   1. npm install googleapis
 *   2. Aseta service account JSON fail samasse kausta, nimeta: service-account.json
 *   3. node create-play-products.js
 */

const { google } = require('googleapis');
const path = require('path');

const PACKAGE_NAME   = 'com.tileroyale.game';
const KEY_FILE       = path.join(__dirname, 'service-account.json');

// ─── Tooted ───────────────────────────────────────────────────────────────────

const PRODUCTS = [
  // ── Diamond Packages ──
  {
    sku: 'd_starter',
    title: '250 Diamonds',
    description: '250 💎 Diamonds for Tile Royale.',
    priceMicros: 1990000,
  },
  {
    sku: 'd_popular',
    title: '700 Diamonds',
    description: '700 💎 Diamonds for Tile Royale. Popular choice!',
    priceMicros: 4990000,
  },
  {
    sku: 'd_value',
    title: '1500 Diamonds',
    description: '1500 💎 Diamonds. Best value starter pack.',
    priceMicros: 9990000,
  },
  {
    sku: 'd_mega',
    title: '3200 Diamonds',
    description: '3200 💎 Diamonds including 400 bonus.',
    priceMicros: 19990000,
  },
  {
    sku: 'd_ultra',
    title: '7500 Diamonds',
    description: '7500 💎 Diamonds including 1000 bonus.',
    priceMicros: 39990000,
  },
  {
    sku: 'd_legend',
    title: '17500 Diamonds',
    description: '17500 💎 Diamonds including 2500 bonus.',
    priceMicros: 79990000,
  },

  // ── Bundles ──
  {
    sku: 'bundle_starter',
    title: 'Starter Pack',
    description: '750 💎 + Crystal Ball x5 + Caltrops x5 + 10 Tickets. Perfect for new players!',
    priceMicros: 4990000,
  },
  {
    sku: 'bundle_fire',
    title: 'Fire Pack',
    description: '1800 💎 + Lava Field skin + Lava Tile skin + items. For competitive players!',
    priceMicros: 11990000,
  },
  {
    sku: 'bundle_champion',
    title: 'Champion Bundle',
    description: '4000 💎 + Galaxy skin + Hologram skin + Void effect + items. Champion bundle!',
    priceMicros: 19990000,
  },
  {
    sku: 'bundle_legend',
    title: 'Legend Bundle',
    description: '10000 💎 + 5 exclusive skins + 50 Tickets + more. Ultimate collection!',
    priceMicros: 49990000,
  },
  {
    sku: 'bundle_mobydick',
    title: 'Moby Dick Pack',
    description: '7500 💎 + Moby Dick victory screen + Whale Badge + items. Exclusive!',
    priceMicros: 49990000,
  },
  {
    sku: 'bundle_whale_1',
    title: 'Whale Pack',
    description: '16000 💎 + Obsidian skins + Diamond Tile + Whale Badge + 100 Tickets. Exclusive!',
    priceMicros: 79990000,
  },
  {
    sku: 'bundle_whale_2',
    title: 'Deep Ocean Bundle',
    description: '26000 💎 + exclusive effects + skins + Whale Badge. For the true elite.',
    priceMicros: 129990000,
  },

  // ── Welcome Offer ──
  {
    sku: 'offer_firstweek',
    title: 'Welcome Offer',
    description: '300 💎 + Lava Field Table skin + Crystal Ball x5 + 5 Tickets. First week only!',
    priceMicros: 1990000,
  },
];

// ─── Skript ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔑 Autentimine...');
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const authClient = await auth.getClient();
  const publisher = google.androidpublisher({ version: 'v3', auth: authClient });

  console.log(`📦 Package: ${PACKAGE_NAME}`);
  console.log(`🛒 Luuakse ${PRODUCTS.length} toodet...\n`);

  const results = { ok: [], skipped: [], failed: [] };

  for (const p of PRODUCTS) {
    const body = {
      packageName: PACKAGE_NAME,
      sku: p.sku,
      status: 'active',
      purchaseType: 'managedUser',
      defaultLanguage: 'en-US',
      listings: {
        'en-US': {
          title: p.title,
          description: p.description,
        },
      },
      prices: {
        'EE': { priceMicros: String(p.priceMicros), currency: 'EUR' },
      },
      defaultPrice: {
        priceMicros: String(p.priceMicros),
        currency: 'EUR',
      },
    };

    try {
      await publisher.inappproducts.insert({
        packageName: PACKAGE_NAME,
        autoConvertMissingPrices: true,
        requestBody: body,
      });
      console.log(`  ✅  ${p.sku.padEnd(20)} ${p.title}`);
      results.ok.push(p.sku);
    } catch (err) {
      const msg = err?.errors?.[0]?.message || err.message || String(err);
      if (msg.includes('already exists') || msg.includes('409')) {
        console.log(`  ⏭️   ${p.sku.padEnd(20)} juba olemas — vahele jäetud`);
        results.skipped.push(p.sku);
      } else {
        console.error(`  ❌  ${p.sku.padEnd(20)} VIGA: ${msg}`);
        results.failed.push({ sku: p.sku, err: msg });
      }
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`✅ Loodud:     ${results.ok.length}`);
  console.log(`⏭️  Olemas:     ${results.skipped.length}`);
  console.log(`❌ Ebaõnnest.: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\nEbaõnnestunud:');
    results.failed.forEach(f => console.log(`  ${f.sku}: ${f.err}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Kriitiline viga:', err.message || err);
  process.exit(1);
});
