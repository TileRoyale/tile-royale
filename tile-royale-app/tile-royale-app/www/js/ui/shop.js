// ===== STORE SYSTEM =====
let currentStoreTab = 'featured';

const DIAMOND_PACKAGES = [
  { id:'d.starter',   amount:250,  bonus:0,    price:'1.99€',  priceVal:1.99,  icon:'💎',    label:'',          css:'' },
  { id:'d.popular',   amount:700,  bonus:0,    price:'4.99€',  priceVal:4.99,  icon:'💎💎',  label:'popular',   css:'popular' },
  { id:'d.value',     amount:1500, bonus:0,    price:'9.99€',  priceVal:9.99,  icon:'💎💎💎', label:'best-value',css:'best-value' },
  { id:'d.mega',      amount:2800, bonus:400,  price:'19.99€', priceVal:19.99, icon:'👑',    label:'',          css:'' },
  { id:'d.ultra',     amount:6500, bonus:1000, price:'39.99€', priceVal:39.99, icon:'🌟',    label:'',          css:'' },
  { id:'d.legend',    amount:15000,bonus:2500, price:'79.99€', priceVal:79.99, icon:'⚡',    label:'',          css:'' },
];

const STORE_ITEMS = [
  { id:'item_crystal_x3',      icon:'🔮', name:'Crystal Ball x3',  desc:'Reveal next tile hint',               price:60,   type:'item', itemId:'crystal', qty:3 },
  { id:'item_caltrops_x3',    icon:'⚙️', name:'Caltrops x3',      desc:'Lock half the players 1s',            price:60,   type:'item', itemId:'caltrops', qty:3 },
  { id:'item_shadow_tile_x3', icon:'🌑', name:'Shadow Tile x3',    desc:'Next round: 2 tiles, 1 is a trap',    price:80,   type:'item', itemId:'shadow_tile', qty:3 },
  { id:'item_crystal_x10',    icon:'🔮', name:'Crystal Ball x10', desc:'Bulk pack — better value',             price:150,  type:'item', itemId:'crystal', qty:10 },
  { id:'item_caltrops_x10',   icon:'⚙️', name:'Caltrops x10',     desc:'Bulk pack — better value',            price:150,  type:'item', itemId:'caltrops', qty:10 },
  { id:'item_shadow_tile_x10',icon:'🌑', name:'Shadow Tile x10',   desc:'Bulk pack — better value',            price:200,  type:'item', itemId:'shadow_tile', qty:10 },
  { id:'item_pepper_x3',      icon:'🌶️', name:'Pepper Spray x3',   desc:'Blind half players for 2s — 4 fake tiles',price:80,  type:'item', itemId:'pepper_spray', qty:3 },
  { id:'item_pepper_x10',      icon:'🌶️', name:'Pepper Spray x10',  desc:'Bulk pack — better value',             price:200,  type:'item', itemId:'pepper_spray',    qty:10 },
  { id:'item_muscle_x3',        icon:'💊',  name:'Muscle Relaxant x3', desc:'Force double-tap on half players',    price:100,  type:'item', itemId:'muscle_relaxant', qty:3 },
  { id:'item_muscle_x10',       icon:'💊',  name:'Muscle Relaxant x10',desc:'Bulk pack — better value',            price:250,  type:'item', itemId:'muscle_relaxant', qty:10 },
  { id:'item_tickets_5',   icon:'🎟️', name:'5 Extra Tickets',  desc:'Play 5 more games today',    price:30,   type:'tickets', qty:5 },
  { id:'item_tickets_20',  icon:'🎟️', name:'20 Extra Tickets', desc:'Never run out today',        price:90,   type:'tickets', qty:20 },
  { id:'item_xp_boost',    icon:'⭐', name:'XP Boost 2×',      desc:'Double XP for next 5 games', price:80,   type:'xpboost', qty:5 },
  { id:'item_name_change',  icon:'✏️', name:'Name Change',      desc:'Change your name for free',  price:50,   type:'namechange', qty:1 },
];

const STORE_BUNDLES = [
  {
    id:'bundle.starter', icon:'🚀', name:'Starter Pack', tagline:'Perfect for new players',
    contents:['💎 750 Diamonds','🔮 Crystal Ball x5','⚙️ Caltrops x5','🎟️ 10 Tickets'],
    originalPrice:'9.99€', price:'4.99€', save:'50% OFF', priceVal:4.99,
    diamondAmt:750, items:{crystal:5, caltrops:5}, tickets:10
  },
  {
    id:'bundle.fire', icon:'🔥', name:'Fire Pack', tagline:'For competitive players',
    contents:['💎 1,800 Diamonds','🔮 Crystal Ball x10','⚙️ Caltrops x10','🎨 Lava Field Table Skin','🟧 Lava Tile Skin'],
    originalPrice:'19.99€', price:'11.99€', save:'40% OFF', priceVal:11.99,
    diamondAmt:1800, items:{crystal:10, caltrops:10},
    skins:['table_lava','tile_lava']
  },
  {
    id:'bundle.champion', icon:'👑', name:'Champion Bundle', tagline:'Everything a champion needs',
    contents:['💎 4,000 Diamonds','🔮 Crystal Ball x20','⚙️ Caltrops x20','🌌 Galaxy Table Skin','💠 Hologram Tile Skin','🌑 Void Effect','⭐ XP Boost x10'],
    originalPrice:'39.99€', price:'19.99€', save:'50% OFF', priceVal:19.99,
    diamondAmt:4000, items:{crystal:20, caltrops:20},
    skins:['table_galaxy','tile_holo','fx_void']
  },
  {
    id:'bundle.legend', icon:'🌟', name:'Legend Bundle', tagline:'Ultimate collection',
    contents:['💎 10,000 Diamonds','🔮 Crystal Ball x50','⚙️ Caltrops x50','All 3 exclusive skins','🏷️ Free name changes x5','🎟️ 50 Tickets','⭐ XP Boost x20'],
    originalPrice:'99.99€', price:'49.99€', save:'50% OFF', priceVal:49.99,
    diamondAmt:10000, items:{crystal:50, caltrops:50},
    skins:['table_galaxy','tile_holo','fx_void','fx_rainbow','tap_portal'],
    tickets:50, nameChanges:5
  },
  // WHALE BUNDLES
  {
    id:'bundle.mobydick', icon:'🐋', name:'Moby Dick', tagline:'The ultimate whale hunter trophy', whale:true,
    contents:['💎 7,500 Diamonds','🏆 Moby Dick Victory Screen (exclusive)','🔮 Crystal Ball ×10','⚙️ Caltrops ×10','🌑 Shadow Tile ×5','🎟️ 20 Tickets','🐋 Whale Badge'],
    originalPrice:'79.99€', price:'49.99€', save:'38% OFF', priceVal:49.99,
    diamondAmt:7500, items:{crystal:10, caltrops:10, shadow_tile:5}, tickets:20,
    skins:['vic_mobydick'], whaleBadge:true
  },
  {
    id:'bundle.whale1', icon:'🐋', name:'Whale Pack', tagline:'Exclusive whale-only content', whale:true,
    contents:['💎 16,000 Diamonds','🌑 Shadow Tile x20','⬛ Obsidian Table (Exclusive)','🖤 Obsidian Tile (Exclusive)','💎 Diamond Tile (Exclusive)','🐋 Whale Badge','🎟️ 100 Tickets'],
    originalPrice:'149.99€', price:'79.99€', save:'47% OFF', priceVal:79.99,
    diamondAmt:16000, items:{shadow_tile:20}, tickets:100,
    skins:['table_obsidian','tile_obsidian','tile_diamond'], whaleBadge:true
  },
  {
    id:'bundle.whale2', icon:'🌊', name:'Deep Ocean Bundle', tagline:'For the true elite', whale:true,
    contents:['💎 26,000 Diamonds','✨ God Ray Effect (Exclusive)','🌀 Black Hole Effect (Exclusive)','💫 Shockwave Tap (Exclusive)','🥇 Gold Crack Tap (Exclusive)','🌠 Aurora Table (Exclusive)','🌑 Shadow Tile x50','All Whale Pack content'],
    originalPrice:'249.99€', price:'129.99€', save:'48% OFF', priceVal:129.99,
    diamondAmt:26000, items:{shadow_tile:50},
    skins:['fx_godray','fx_blackhole','tap_shockwave','tap_goldcrack','table_aurora','table_obsidian','tile_obsidian','tile_diamond'],
    whaleBadge:true
  },
];

// Daily deal — changes every day
function getDailyDeal() {
  const day = Math.floor(Date.now() / 86400000);
  const deals = [
    { icon:'🔥', name:'Lava Field Table Skin',  orig:'50',  now:'25', skinTab:'table', skinId:'table_lava' },
    { icon:'⚡', name:'Electric Tile Effect',    orig:'75',  now:'38', skinTab:'tileeffect', skinId:'fx_electric' },
    { icon:'🌈', name:'Rainbow Tile Effect',     orig:'150', now:'75', skinTab:'tileeffect', skinId:'fx_rainbow' },
    { icon:'🔮', name:'Crystal Ball x5',         orig:'50',  now:'25', type:'item', itemId:'crystal', qty:5 },
    { icon:'💠', name:'Hologram Tile Skin',      orig:'100', now:'50', skinTab:'tile', skinId:'tile_holo' },
    { icon:'🌑', name:'Void Tile Effect',         orig:'150', now:'75', skinTab:'tileeffect', skinId:'fx_void' },
    { icon:'🌀', name:'Portal Tap Effect',        orig:'150', now:'75', skinTab:'tapeffect', skinId:'tap_portal' },
  ];
  return deals[day % deals.length];
}

function getDailyDealTimer() {
  const now = new Date();
  const midnight = new Date(now); midnight.setHours(24,0,0,0);
  const diff = Math.floor((midnight - now) / 1000);
  const h = Math.floor(diff/3600), m = Math.floor((diff%3600)/60);
  return `Resets in ${h}h ${m}m`;
}

function openStore() {
  currentStoreTab = 'featured';
  document.getElementById('storeBalance').textContent = (gameState.diamonds||0).toLocaleString();
  showScreen('storeScreen');
  document.querySelectorAll('.store-tab').forEach((t,i) => t.classList.toggle('active', i===0));
  renderStore('featured');
  window.scrollTo(0, 0);
  if (typeof isFirstWeekActive === 'function' && isFirstWeekActive()) {
    setTimeout(showFirstWeekOffer, 800);
  }
}

function switchStoreTab(tab, el) {
  currentStoreTab = tab;
  document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderStore(tab);
  window.scrollTo(0, 0);
}

function renderStore(tab) {
  const c = document.getElementById('storeContent');
  c.innerHTML = '';
  if (tab === 'featured') renderFeatured(c);
  else if (tab === 'diamonds') renderDiamonds(c);
  else if (tab === 'items') renderItems(c);
  else if (tab === 'skins') renderStoreSkins(c);
  else if (tab === 'bundles') renderBundles(c);
  else if (tab === 'onlywhales') renderOnlyWhales(c);
}

function renderFeatured(c) {
  // Hero banner
  c.innerHTML += `
    <div class="store-banner" style="background:linear-gradient(135deg,#1a0500,#ff4500,#ff8c00)">
      <div class="store-banner-content">
        <div class="store-banner-tag">🔥 Limited Time</div>
        <div class="store-banner-title">Champion Bundle</div>
        <div class="store-banner-desc">Galaxy skin + Void effect + 4,000 diamonds — 50% off</div>
        <button class="store-banner-btn" style="color:#ff4500;" onclick="switchStoreTab('bundles', document.querySelectorAll('.store-tab')[4])">VIEW BUNDLE →</button>
      </div>
    </div>`;

  // First week offer (if active)
  if (isFirstWeekActive()) {
    c.innerHTML += `
      <div class="store-section-hdr" style="color:var(--fire);">⚡ Limited Time</div>
      <div class="ad-reward-box" onclick="showFirstWeekOffer()"
        style="border-color:rgba(255,69,0,0.4);background:linear-gradient(135deg,rgba(255,69,0,0.06),var(--panel));">
        <div class="ad-reward-icon">🎁</div>
        <div class="ad-reward-info">
          <div class="ad-reward-title">Welcome Offer — 1.99€</div>
          <div class="ad-reward-sub">💎 300 + Lava Skin + Crystal Ball ×5 + 5 Tickets</div>
          <div class="ad-reward-timer">${getFirstWeekTimer()}</div>
        </div>
        <div class="ad-reward-btn" style="border-color:var(--fire);color:var(--fire);">VIEW</div>
      </div>`;
  }

  // Ad reward banner
  c.innerHTML += `
    <div class="store-section-hdr">📺 Free Ad Reward</div>
    <div class="ad-reward-box" id="storeAdRewardBox" onclick="watchAdForRandomItem()">
      <div class="ad-reward-icon">🎁</div>
      <div class="ad-reward-info">
        <div class="ad-reward-title">Watch Ad — Get Random Item</div>
        <div class="ad-reward-sub">Ticket 80% · Crystal Ball 10% · Caltrops 7% · Shadow Tile 3%</div>
        <div class="ad-reward-timer" id="storeAdTimer">Available now!</div>
      </div>
      <div class="ad-reward-btn" id="storeAdBtn">▶ WATCH</div>
    </div>`;
  updateStoreAdTimer();

  // Daily deal
  const deal = getDailyDeal();
  c.innerHTML += `
    <div class="store-section-hdr">🔥 Daily Deal</div>
    <div class="daily-deal-box" onclick="buyDailyDeal()">
      <div class="daily-deal-icon">${deal.icon}</div>
      <div class="daily-deal-info">
        <div class="daily-deal-tag">Daily Deal</div>
        <div class="daily-deal-name">${deal.name}</div>
        <div class="daily-deal-timer">⏱ ${getDailyDealTimer()}</div>
      </div>
      <div class="daily-deal-price">
        <div class="daily-deal-orig">💎 ${deal.orig}</div>
        <div class="daily-deal-now">💎 ${deal.now}</div>
      </div>
    </div>`;

  // Top diamond packages
  c.innerHTML += `<div class="store-section-hdr">💎 Top Up Diamonds</div>`;
  const grid = document.createElement('div');
  grid.className = 'diamond-grid';
  DIAMOND_PACKAGES.slice(0,4).forEach(pkg => {
    grid.innerHTML += buildDiamondCard(pkg);
  });
  c.appendChild(grid);

  // Top items
  c.innerHTML += `<div class="store-section-hdr">🎒 Popular Items</div>`;
  const ig = document.createElement('div');
  ig.className = 'store-item-grid';
  STORE_ITEMS.slice(0,4).forEach(item => { ig.innerHTML += buildItemCard(item); });
  c.appendChild(ig);

  // View all skins button
  c.innerHTML += `
    <div class="store-section-hdr">🎨 Skins</div>
    <button class="btn-secondary" style="width:100%;" onclick="switchStoreTab('skins', document.querySelectorAll('.store-tab')[3])">
      Browse All Skins →
    </button>`;
}

function renderDiamonds(c) {
  c.innerHTML = `
    <div class="store-section-hdr">💎 Diamond Packages</div>
    <div style="font-size:11px; color:var(--muted); letter-spacing:1px; margin-bottom:12px;">Tap to purchase</div>`;
  const grid = document.createElement('div');
  grid.className = 'diamond-grid';
  (DIAMOND_PACKAGES||[]).forEach(pkg => { grid.innerHTML += buildDiamondCard(pkg); });
  c.appendChild(grid);
  c.innerHTML += `
    <div style="font-size:11px; color:var(--muted); text-align:center; margin-top:12px; letter-spacing:1px; line-height:1.6;">
      🔒 Secure payment · Prices include VAT<br>
      💎 Diamonds are added instantly after purchase
    </div>
    <button onclick="manualRestorePurchases()"
      style="width:100%;margin-top:16px;padding:10px;background:transparent;border:1px solid var(--border);
             border-radius:8px;color:var(--muted);font-size:11px;letter-spacing:1px;cursor:pointer;">
      RESTORE PURCHASES
    </button>`;
}

function buildDiamondCard(pkg) {
  const bonusText = pkg.bonus > 0 ? `+${pkg.bonus.toLocaleString()} bonus` : '&nbsp;';
  return `<div class="diamond-card ${pkg.css}" onclick="buyDiamondPackage('${pkg.id}')">
    <div class="diamond-card-icon">${pkg.icon}</div>
    <div class="diamond-card-amount">💎 ${pkg.amount.toLocaleString()}</div>
    <div class="diamond-card-bonus">${bonusText}</div>
    <div class="diamond-card-price">${pkg.price}</div>
  </div>`;
}

function renderItems(c) {
  c.innerHTML = `<div class="store-section-hdr">🎒 Items & Boosters</div>`;
  const grid = document.createElement('div');
  grid.className = 'store-item-grid';
  (STORE_ITEMS||[]).forEach(item => { grid.innerHTML += buildItemCard(item); });
  c.appendChild(grid);
}

function buildItemCard(item) {
  return `<div class="store-item-card" onclick="buyStoreItem('${item.id}')">
    <div class="store-item-icon">${item.icon}</div>
    <div class="store-item-name">${item.name}</div>
    <div class="store-item-desc">${item.desc}</div>
    <div class="store-item-price">💎 ${item.price.toLocaleString()}</div>
  </div>`;
}

function renderStoreSkins(c) {
  ['table','tile','tileeffect','tapeffect'].forEach(tab => {
    const tabNames = { table:'🎰 Table Skins', tile:'🟥 Tile Skins', tileeffect:'🔥 Tile Effects', tapeffect:'💥 Tap Effects' };
    const hdr = document.createElement('div');
    hdr.className = 'store-section-hdr';
    hdr.textContent = tabNames[tab];
    c.appendChild(hdr);
    const grid = document.createElement('div');
    grid.className = 'store-item-grid';
    SKINS[tab].filter(s => s.price > 0).forEach(skin => {
      const owned = skin.owned || (gameState.ownedSkins && gameState.ownedSkins[skin.id]);
      const card = document.createElement('div');
      card.className = 'store-item-card' + (owned ? ' owned' : '');
      if (!owned) card.onclick = () => selectSkin(tab, skin, false);
      card.innerHTML = `
        <div class="skin-mini-preview" id="store-mini-${skin.id}" style="width:56px;height:56px;border-radius:10px;margin:0 auto 6px;"></div>
        <div class="store-item-name">${skin.name}</div>
        <div class="store-item-price">${owned ? '✓ Owned' : '💎 ' + skin.price}</div>`;
      grid.appendChild(card);
      if (typeof buildMiniPreview === 'function') {
        setTimeout(() => {
          const el = document.getElementById('store-mini-' + skin.id);
          if (el) { el.id = 'mini-' + skin.id; buildMiniPreview(skin.id, tab); el.id = 'store-mini-' + skin.id; }
        }, 0);
      }
    });
    c.appendChild(grid);
  });
}

function renderBundles(c) {
  c.innerHTML = `<div class="store-section-hdr">📦 Bundle Deals</div>`;
  // Only regular bundles — whale bundles are in OnlyWhales tab
  STORE_BUNDLES.filter(b => !b.whale).forEach(b => {
    c.appendChild(buildBundleCard(b));
  });
  // Teaser for whale section
  c.innerHTML += `
    <div style="margin-top:16px; width:100%; background:rgba(0,229,255,0.04);
      border:1px solid rgba(0,229,255,0.15); border-radius:12px; padding:14px 16px;
      display:flex; align-items:center; gap:12px; cursor:pointer;"
      onclick="switchStoreTab('onlywhales', document.querySelectorAll('.store-tab')[5])">
      <div style="font-size:28px;">🐋</div>
      <div style="flex:1;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;color:var(--diamond);">ONLYWHALES</div>
        <div style="font-size:11px;color:var(--muted);letter-spacing:1px;">Exclusive content for the true elite</div>
      </div>
      <div style="color:var(--diamond);font-size:18px;">›</div>
    </div>`;
}

function renderOnlyWhales(c) {
  const isWhale = isPlayerWhale();

  // Hero section
  c.innerHTML = `
    <div class="onlywhales-hero">
      <div class="onlywhales-crown">🐋</div>
      <div class="onlywhales-title">ONLYWHALES</div>
      <div class="onlywhales-sub">
        Exclusive content that cannot be obtained<br>any other way in the game
      </div>
      ${isWhale ? '<div class="onlywhales-badge">🐋 WHALE STATUS ACTIVE</div>' : ''}
    </div>`;

  if (!isWhale) {
    // Show locked state with teaser
    c.innerHTML += `
      <div class="onlywhales-locked">
        <div class="onlywhales-locked-icon">🔒</div>
        <div class="onlywhales-locked-title">Whale Status Required</div>
        <div class="onlywhales-locked-desc">
          Purchase a Whale Pack to unlock this exclusive section.<br><br>
          Whale bundles include skins, effects and avatars that will<br>
          <b style="color:var(--diamond)">never be available to regular players.</b><br><br>
          Start with the <b style="color:var(--gold)">Moby Dick Pack</b> to unlock Whale status.
        </div>
      </div>

      <div class="store-section-hdr" style="color:var(--gold);">🐋 Unlock Whale Status</div>
      <div class="bundle-card" style="border-color:rgba(0,229,255,0.3);background:linear-gradient(135deg,rgba(0,229,255,0.04),var(--panel));cursor:pointer;"
        onclick="buyBundle('bundle.mobydick')">
        <div class="bundle-header">
          <div class="bundle-icon">🐋</div>
          <div class="bundle-info">
            <div class="bundle-name" style="color:var(--diamond);">Moby Dick Pack</div>
            <div class="bundle-tagline">Unlocks Whale status + exclusive content</div>
          </div>
          <div class="bundle-price-col">
            <div class="bundle-orig">79.99€</div>
            <div class="bundle-price">49.99€</div>
          </div>
        </div>
        <div class="bundle-contents">
          💎 5,000 · 🏆 Moby Dick Victory Screen · 🐋 Whale Badge · 🎟️ 20 Tickets · 🔮 Crystal Ball ×10
        </div>
      </div>

      <div class="store-section-hdr" style="color:var(--diamond);">👁️ Preview — After Whale Status</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;opacity:0.5;pointer-events:none;">`;

    STORE_BUNDLES.filter(b => b.whale && b.id !== 'bundle.mobydick').forEach(b => {
      c.innerHTML += `
        <div style="background:var(--panel);border:1px solid rgba(0,229,255,0.2);border-radius:14px;
          padding:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
            background:rgba(10,10,15,0.7);z-index:2;font-size:32px;">🔒</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:var(--diamond);">
            ${b.icon} ${b.name}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;">${b.tagline}</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--diamond);margin-top:8px;">
            ${b.price}</div>
        </div>`;
    });
    c.innerHTML += `</div>`;

    // CTA
    c.innerHTML += `
      <button class="btn-play" style="background:linear-gradient(135deg,#001a3a,#003366);
        border:1px solid var(--diamond);color:var(--diamond);"
        onclick="switchStoreTab('bundles', document.querySelectorAll('.store-tab')[4])">
        View Regular Bundles First →
      </button>`;
    return;
  }

  // Whale is active — show real content (exclude Moby Dick — entry pack already used)
  // Build everything with appendChild so innerHTML += never wipes out onclick handlers.
  const bundleHdr = document.createElement('div');
  bundleHdr.className = 'store-section-hdr';
  bundleHdr.style.color = 'var(--diamond)';
  bundleHdr.textContent = '🌊 Exclusive Whale Bundles';
  c.appendChild(bundleHdr);

  STORE_BUNDLES.filter(b => b.whale && b.id !== 'bundle.mobydick').forEach(b => {
    c.appendChild(buildBundleCard(b));
  });

  // Exclusive whale skins preview — also DOM-built so it never resets earlier event handlers
  const skinsHdr = document.createElement('div');
  skinsHdr.className = 'store-section-hdr';
  skinsHdr.style.color = 'var(--diamond)';
  skinsHdr.textContent = '✨ Your Exclusive Skins';
  c.appendChild(skinsHdr);

  const skinsBox = document.createElement('div');
  skinsBox.style.cssText = 'background:var(--panel);border:1px solid rgba(0,229,255,0.2);border-radius:12px;padding:14px 16px;';
  const skinsSub = document.createElement('div');
  skinsSub.style.cssText = 'font-size:12px;color:var(--muted);letter-spacing:1px;margin-bottom:10px;';
  skinsSub.textContent = 'These skins are in your profile — only you and other whales have them.';
  skinsBox.appendChild(skinsSub);
  const skinsRow = document.createElement('div');
  skinsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
  (WHALE_EXCLUSIVE_SKINS || []).forEach(s => {
    const owned = gameState.ownedSkins?.[s.id];
    const chip = document.createElement('div');
    chip.style.cssText = `background:var(--bg);border:1px solid ${owned ? 'rgba(0,229,255,0.4)' : 'var(--border)'};border-radius:8px;padding:8px 12px;font-size:13px;color:${owned ? 'var(--diamond)' : 'var(--muted)'};letter-spacing:1px;`;
    chip.textContent = `${s.icon} ${s.name} ${owned ? '✓' : '🔒'}`;
    skinsRow.appendChild(chip);
  });
  skinsBox.appendChild(skinsRow);
  c.appendChild(skinsBox);
}

function buildBundleCard(b) {
  const div = document.createElement('div');
  div.className = 'bundle-card' + (b.whale ? ' whale-bundle' : '');
  div.onclick = () => buyBundle(b.id);
  div.innerHTML = `
    ${b.whale ? '<div class="whale-exclusive-tag">🐋 WHALE EXCLUSIVE</div>' : ''}
    <div class="bundle-header">
      <div class="bundle-icon">${b.icon}</div>
      <div class="bundle-header-info">
        <div class="bundle-name">${b.name}</div>
        <div class="bundle-tagline">${b.tagline}</div>
      </div>
      <div class="bundle-save" style="${b.whale ? 'background:rgba(0,229,255,0.15);color:var(--diamond);' : ''}">${b.save}</div>
    </div>
    <div class="bundle-contents">
      ${b.contents.map(item => `<div class="bundle-tag" style="${b.whale ? 'border-color:rgba(0,229,255,0.2);' : ''}">${item}</div>`).join('')}
    </div>
    <div class="bundle-footer">
      <div class="bundle-original">${b.originalPrice}</div>
      <div class="bundle-price" style="${b.whale ? 'color:var(--diamond);' : ''}">${b.price}</div>
    </div>`;
  return div;
}

// ---- Purchase verify helpers ----

// Calls /purchase/verify and applies the server-authoritative grant.
// Falls back to a locally-computed grant if the server is unreachable.
async function _verifyAndDeliverPurchase(purchase) {
  const { productId, purchaseToken = '', orderId = '' } = purchase || {};

  let grant = null;

  if (productId && purchaseToken && typeof PLAYER_ID !== 'undefined' && PLAYER_ID) {
    try {
      const r = await fetch(`${getActiveServer().http}/purchase/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, productId, purchaseToken, orderId }),
        signal: AbortSignal.timeout(12000),
      });
      const data = r.ok ? await r.json() : null;
      if (data?.ok || data?.error === 'already_processed') {
        grant = data.grant;
      } else {
        console.warn('[Purchase] Server verify failed:', data?.error);
      }
    } catch(e) {
      console.warn('[Purchase] Verify network error — falling back to local delivery:', e?.message || e);
    }
  }

  if (!grant) {
    // Server unreachable: build grant from local catalog so the player still gets their items.
    // Also store in pendingPurchases queue so billing.js retries on next startup.
    const pkg = DIAMOND_PACKAGES.find(p => p.id === productId);
    const bundle = STORE_BUNDLES.find(b => b.id === productId);
    if (pkg) {
      grant = { type:'diamonds', diamonds: pkg.amount + pkg.bonus, priceVal: pkg.priceVal };
    } else if (bundle) {
      grant = { type:'bundle', bundleId: bundle.id, diamonds: bundle.diamondAmt,
                items: bundle.items, skins: bundle.skins, tickets: bundle.tickets,
                nameChanges: bundle.nameChanges, whaleBadge: bundle.whaleBadge, priceVal: bundle.priceVal };
    } else {
      console.error('[Purchase] Unknown productId:', productId);
      return;
    }
    // Queue for retry on next startup — survives even if Google Play token is already consumed
    try {
      const pending = JSON.parse(localStorage.getItem('_pendingPurchases') || '[]');
      const alreadyQueued = pending.some(p => p.purchaseToken === purchaseToken);
      if (!alreadyQueued) {
        pending.push({ productId, purchaseToken, orderId, queuedAt: Date.now() });
        localStorage.setItem('_pendingPurchases', JSON.stringify(pending));
      }
    } catch(e) {}
  } else {
    // Server verified successfully — remove from pending queue if it was there
    try {
      const pending = JSON.parse(localStorage.getItem('_pendingPurchases') || '[]');
      const filtered = pending.filter(p => p.purchaseToken !== purchaseToken);
      if (filtered.length !== pending.length) localStorage.setItem('_pendingPurchases', JSON.stringify(filtered));
    } catch(e) {}
  }

  _applyPurchaseGrant(grant);

  // Consume the purchase so Google Play doesn't auto-refund after 3 days
  // and allows re-purchase of the same product.
  if (purchaseToken) {
    try {
      const billing = window.Capacitor?.Plugins?.Billing;
      if (billing) await billing.consume({ purchaseToken });
    } catch(e) {
      console.warn('[Purchase] consume failed (non-critical):', e?.message || e);
    }
  }
}

// Applies a purchase grant (from server or local fallback) to gameState.
function _applyPurchaseGrant(grant) {
  const diamonds = grant.diamonds || 0;
  if (diamonds > 0) {
    gameState.diamonds      = (gameState.diamonds      || 0) + diamonds;
    gameState.totalDiamonds = (gameState.totalDiamonds || 0) + diamonds;
  }
  if (grant.items)       Object.entries(grant.items).forEach(([k, v]) => addItemToInventory(k, Number(v)));
  if (grant.skins)       { if (!gameState.ownedSkins) gameState.ownedSkins = {}; grant.skins.forEach(s => gameState.ownedSkins[s] = true); }
  if (grant.tickets)     gameState.tickets  = (gameState.tickets  || 0) + grant.tickets;
  if (grant.nameChanges) gameState.renames  = Math.max(0, (gameState.renames || 3) - grant.nameChanges);
  if (grant.whaleBadge)  { gameState.whaleBadge = true; showToast('🐋 Whale status unlocked!', 'var(--diamond)'); }
  const linkedAvatars = typeof ALL_AVATARS !== 'undefined'
    ? ALL_AVATARS.filter(av => av.unlock === grant.bundleId) : [];
  linkedAvatars.forEach(av => { try { unlockAvatar(av.id); } catch(e) {} });

  // Whale achievement stats
  initAchStats();
  gameState.achStats.diamondsPurchased = (gameState.achStats.diamondsPurchased || 0) + 1;
  const priceCents = Math.round((grant.priceVal || 0) * 100);
  gameState.achStats.totalSpentCents   = (gameState.achStats.totalSpentCents   || 0) + priceCents;
  gameState.achStats.singlePurchaseMax = Math.max(gameState.achStats.singlePurchaseMax || 0, priceCents);
  if (grant.bundleId) gameState.achStats.bundlesBought = (gameState.achStats.bundlesBought || 0) + 1;
  checkAchievements();

  saveState(); updateMenuStats(); updateInventoryUI();
  const bal = document.getElementById('storeBalance');
  if (bal) bal.textContent = (gameState.diamonds || 0).toLocaleString();
  const label = grant.type === 'bundle'
    ? `Bundle unlocked! 💎 +${diamonds.toLocaleString()}`
    : `💎 +${diamonds.toLocaleString()} Diamonds added!`;
  showToast(label, 'var(--green)');
}

// ---- Buy functions ----
async function buyDiamondPackage(id) {
  const pkg = DIAMOND_PACKAGES.find(p => p.id === id);
  if (!pkg) return;

  // Native Google Play Billing (Android)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Billing) {
    try {
      showToast('Opening store...', 'var(--blue)');
      const purchase = await nativePurchase(pkg.id);
      await _verifyAndDeliverPurchase(purchase);
    } catch (e) {
      const msg = (e && (e.message || e.code || e));
      if (msg !== 'cancelled') showToast('Purchase failed. Try again.', 'var(--red)');
    }
    return;
  }

  showToast('Purchases require the Android app.', 'var(--muted)');
}

function buyStoreItem(id) {
  const item = STORE_ITEMS.find(i => i.id === id);
  if (!item) return;
  if (gameState.diamonds < item.price) { showToast('Not enough diamonds!', 'var(--red)'); return; }
  showStoreBuyDialog(item.name, item.icon, `💎 ${item.price}`, () => {
    _auditDiamondSpend(item.id, item.price);
    gameState.diamonds -= item.price;
    if (item.type === 'item') addItemToInventory(item.itemId, item.qty);
    else if (item.type === 'tickets') gameState.tickets = (gameState.tickets||0) + item.qty;
    else if (item.type === 'namechange') gameState.renames = Math.max(0, (gameState.renames||3) - item.qty);
    else if (item.type === 'xpboost') { gameState.xpBoostGames = (gameState.xpBoostGames||0) + item.qty; }
    saveState(); updateMenuStats(); updateInventoryUI();
    document.getElementById('storeBalance').textContent = (gameState.diamonds||0).toLocaleString();
    showToast(`✅ ${item.name} added!`, 'var(--green)');
  });
}

async function buyBundle(id) {
  const b = STORE_BUNDLES.find(x => x.id === id);
  if (!b) return;

  // Native Google Play Billing (Android)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Billing) {
    try {
      showToast('Opening store...', 'var(--blue)');
      const purchase = await nativePurchase(b.id);
      await _verifyAndDeliverPurchase(purchase);
    } catch (e) {
      const msg = (e && (e.message || e.code || e));
      if (msg !== 'cancelled') showToast('Purchase failed. Try again.', 'var(--red)');
    }
    return;
  }

  showToast('Purchases require the Android app.', 'var(--muted)');
}

function buyDailyDeal() {
  const deal = getDailyDeal();
  const price = parseInt(deal.now);
  if (gameState.diamonds < price) { showToast('Not enough diamonds!', 'var(--red)'); return; }
  showStoreBuyDialog(deal.name, deal.icon, `💎 ${deal.now}`, () => {
    _auditDiamondSpend(deal.skinId || deal.itemId || 'daily_deal', price);
    gameState.diamonds -= price;
    if (deal.skinId && deal.skinTab) {
      if (!gameState.ownedSkins) gameState.ownedSkins = {};
      gameState.ownedSkins[deal.skinId] = true;
      activeSkins[deal.skinTab] = deal.skinId;
      gameState.activeSkins = activeSkins;
    } else if (deal.itemId) {
      addItemToInventory(deal.itemId, deal.qty || 5);
    }
    saveState(); updateMenuStats();
    document.getElementById('storeBalance').textContent = (gameState.diamonds||0).toLocaleString();
    showToast(`✅ Daily deal claimed!`, 'var(--gold)');
  });
}

// Generic store confirm dialog (reuses buy dialog)
function showStoreBuyDialog(name, icon, priceText, onConfirm) {
  storePendingCb = onConfirm;
  document.getElementById('buyDialogIcon').textContent = icon;
  document.getElementById('buyDialogName').textContent = name;
  document.getElementById('buyDialogPrice').textContent = priceText;
  document.getElementById('buyDialogBalance').textContent = `Your balance: 💎 ${(gameState.diamonds||0).toLocaleString()}`;
  document.getElementById('buyDialogOverlay').classList.add('show');
  // Hijack confirmBuy temporarily
  window._storeBuyMode = true;
}

// confirmBuy handles both store callbacks and skin purchases cleanly
// No function hijacking — uses storePendingCb flag only

