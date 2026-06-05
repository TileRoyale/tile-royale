const AD_SPINS_MAX = 3;                          // max ad spins per day
const DIAMOND_SPIN_COSTS = [50, 100, 200];       // spin costs after ads exhausted

// ── RING DATA (moved to top for hoisting) ──
const RING_RARITIES = [
  { id:'secret',    label:'SECRET',    color:'#ff3355', prob:0.0001, cls:'ring-secret' },
  { id:'legendary', label:'LEGENDARY', color:'#ffd700', prob:0.001,  cls:'ring-legendary' },
  { id:'epic',      label:'EPIC',      color:'#9b59b6', prob:0.05,   cls:'ring-epic' },
  { id:'rare',      label:'RARE',      color:'#00e5ff', prob:0.15,   cls:'ring-rare' },
  { id:'uncommon',  label:'UNCOMMON',  color:'#00ff88', prob:0.30,   cls:'ring-uncommon' },
  { id:'common',    label:'COMMON',    color:'#555570', prob:0.4989, cls:'ring-common' },
];

const RING_EMOJIS  = ['💍','💎','👑','🔮','✨','⚜️','🌙','🌟','💫','🌀','🔱','🌊','🔥','❄️','⚡'];
const RING_NAMES_A = ['Solar','Lunar','Void','Storm','Flame','Frost','Shadow','Ember','Crystal','Mystic','Astral','Celestial','Infernal','Arcane','Ancient'];
const RING_NAMES_B = ['Signet','Band','Coil','Loop','Arc','Halo','Crest','Seal','Mark','Aura','Glimmer','Wraith','Bloom','Pulse','Echo'];

const RINGS = Array.from({length:100}, (_,i) => {
  const emoji = RING_EMOJIS[i % RING_EMOJIS.length];
  const nameA  = RING_NAMES_A[i % RING_NAMES_A.length];
  const nameB  = RING_NAMES_B[i % RING_NAMES_B.length];
  // Distribute rarities: 2 secret, 10 legendary, 25 epic, 30 rare, 33 total common/uncommon
  let rarityId;
  if (i < 2)       rarityId = 'secret';
  else if (i < 12) rarityId = 'legendary';
  else if (i < 37) rarityId = 'epic';
  else if (i < 67) rarityId = 'rare';
  else if (i < 80) rarityId = 'uncommon';
  else              rarityId = 'common';
  return { id: `ring_${i}`, name: `${nameA} ${nameB}`, emoji, rarityId };
});

const FINGER_NAMES = ['Thumb','Index','Middle','Ring','Pinky'];
// RARITY_ORDER moved to top

// ── RING CSS SPRITE SYSTEM ─────────────────────────────────────────────
// Rings.png: 835×701px. Per-rarity crop origins measured from actual sphere
// visual centers (center-of-mass of bright pixels) so each ring is perfectly
// centered in its display box at any size. cropX = sphereX−55, cropY = sphereY−55.
const _RING_IW = 835, _RING_IH = 701, _RING_SQ = 109;
const _RING_CROP = {
  common:    { x: 422, y:  47 },
  uncommon:  { x: 428, y: 144 },
  rare:      { x: 418, y: 252 },
  epic:      { x: 418, y: 372 },
  legendary: { x: 421, y: 468 },
  secret:    { x: 420, y: 575 },
};

// Returns a <div> showing the correctly centered ring sprite at pxSize×pxSize.
function ringImgHtml(rarityId, pxSize) {
  if (typeof pxSize !== 'number') pxSize = 36;
  var crop = _RING_CROP[rarityId] || _RING_CROP.common;
  var sc   = pxSize / _RING_SQ;
  var bgW  = (_RING_IW * sc).toFixed(1);
  var bgH  = (_RING_IH * sc).toFixed(1);
  var bgX  = (-crop.x * sc).toFixed(1);
  var bgY  = (-crop.y * sc).toFixed(1);
  return '<div class="gv2-ring-img" style="width:'+pxSize+'px;height:'+pxSize+'px;'+
    'background:url(\'img/rings.png\') no-repeat '+bgX+'px '+bgY+'px/'+bgW+'px '+bgH+'px;'+
    'flex-shrink:0;"></div>';
}

function getRarityDef(id) { return RING_RARITIES.find(r=>r.id===id) || RING_RARITIES[5]; }
function getRingDef(id)   { return RINGS.find(r=>r.id===id); }

function getGauntletRarity() {
  const equipped = gameState.gauntlet || {};
  const fingers  = Object.values(equipped).filter(Boolean);
  if (!fingers.length) return null;
  const best = fingers.map(rid => {
    const ring = getRingDef(rid);
    return ring ? RARITY_ORDER.indexOf(ring.rarityId) : 99;
  }).reduce((a,b) => Math.min(a,b), 99);
  return RARITY_ORDER[best] || null;
}

// Rarity probability weights for % display
const RARITY_PROB = {
  secret: 0.0001, legendary: 0.001, epic: 0.05,
  rare: 0.15, uncommon: 0.30, common: 0.4989
};

function getGauntletRarityPercent() {
  const equipped = gameState.gauntlet || {};
  const fingers  = Object.values(equipped).filter(Boolean);
  if (!fingers.length) return null;
  const avgProb = fingers.reduce((sum, rid) => {
    const ring = getRingDef(rid);
    return sum + (ring ? (RARITY_PROB[ring.rarityId] || 0.4989) : 0.4989);
  }, 0) / fingers.length;
  return avgProb;
}

function getGauntletRarityLabel() {
  const prob = getGauntletRarityPercent();
  if (prob === null) return null;
  if (prob <= 0.0001) return 'secret';
  if (prob <= 0.005)  return 'legendary';
  if (prob <= 0.08)   return 'epic';
  if (prob <= 0.20)   return 'rare';
  if (prob <= 0.35)   return 'uncommon';
  return 'common';
}

function renderMenuGauntletWidget() {
  const lvl    = gameState.level || 1;
  const locked = document.getElementById('gauntletWidgetLocked');
  const active = document.getElementById('gauntletWidgetActive');
  if (!locked || !active) return;

  if (lvl < 3) {
    locked.style.display = 'block';
    active.style.display = 'none';
    return;
  }
  locked.style.display = 'none';
  active.style.display = 'block';

  // Render 5 finger slots
  const slotsEl  = document.getElementById('menuFingerSlots');
  const equipped = gameState.gauntlet || {};
  if (slotsEl) {
    slotsEl.innerHTML = FINGER_NAMES.map((fname, i) => {
      const ringId = equipped[i];
      const ring   = ringId ? getRingDef(ringId) : null;
      const rar    = ring  ? getRarityDef(ring.rarityId) : null;
      const empty  = !ring;
      const eff    = (ring && typeof gmGetSingleRingEffect === 'function') ? gmGetSingleRingEffect(ringId) : null;
      return `<div class="menu-finger-slot ${empty ? 'slot-empty' : ''}"
                   style="${rar ? `border-color:${rar.color}44;` : ''}"
                   onclick="event.stopPropagation();openGauntletToSlot(${i})">
        <div class="mfs-emoji">${ring ? (ringImgHtml(ring.rarityId, 28) || ring.emoji) : '⭕'}</div>
        <div class="mfs-label">${fname}</div>
        <div class="mfs-rarity ${rar?.cls || ''}">${rar ? rar.label : '—'}</div>
        ${eff ? `<div style="font-size:8px;letter-spacing:0.5px;color:${rar.color};margin-top:1px;opacity:0.9;">${eff.label} ${eff.pct}</div>` : ''}
      </div>`;
    }).join('');
  }

  // Combined rarity + %
  const rarEl   = document.getElementById('menuGauntletRarity');
  const fingers = Object.values(equipped).filter(Boolean);
  if (rarEl) {
    if (!fingers.length) {
      rarEl.innerHTML = '<span style="color:var(--muted);font-size:11px;">No rings equipped — tap to open</span>';
    } else {
      const rarId = getGauntletRarityLabel();
      const def   = getRarityDef(rarId);
      const prob  = getGauntletRarityPercent();
      const pct   = (prob * 100).toFixed(prob < 0.01 ? 4 : prob < 0.1 ? 2 : 1);
      rarEl.innerHTML = `<span class="${def.cls}">✦ ${def.label}</span>`
        + `<span style="color:var(--muted);font-size:10px;letter-spacing:1px;margin-left:8px;">`
        + `avg ${pct}% · ${fingers.length}/5 slots filled</span>`;
    }
  }
}

function openGauntletToSlot(fingerIdx) {
  openGauntlet();
  setTimeout(() => equipRingToFinger(fingerIdx), 150);
}

// ── GAUNTLET HAND RENDER ─────────────────────────────────────────────
// GAUNTLET UI V2 — image-based hand display with interactive hotspots
function renderGauntletHand() {
  const el = document.getElementById('gauntletHandDisplay');
  if (!el) return;
  const equipped = gameState.gauntlet || {};

  // Build 5 hotspot divs positioned over the ring slot circles in gauntlet.png
  const hotspots = FINGER_NAMES.map((fname, i) => {
    const ringId = equipped[i];
    const ring   = ringId ? getRingDef(ringId) : null;
    const rar    = ring ? getRarityDef(ring.rarityId) : null;
    const eff    = (ring && typeof gmGetSingleRingEffect === 'function') ? gmGetSingleRingEffect(ringId) : null;
    const stateClass = ring ? 'hs-equipped' : 'hs-empty';
    const colorStyle  = rar ? `style="--hs-clr:${rar.color};"` : '';
    const iconHtml    = ring ? ringImgHtml(ring.rarityId, 36) : '';
    const effLabel    = eff
      ? `<div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:8px;letter-spacing:0.5px;color:${rar.color};background:rgba(0,0,0,0.75);padding:1px 4px;border-radius:4px;">${eff.label} ${eff.pct}</div>`
      : '';
    return `<div class="gv2-hs gv2-hs-${i} ${stateClass}" ${colorStyle}
                 id="gv2-slot-${i}"
                 onclick="equipRingToFinger(${i})"
                 title="${fname}${ring ? ': ' + ring.name + (eff ? ' — ' + eff.label + ' ' + eff.pct : '') : ' — tap to equip'}"
                 style="position:relative;${rar ? '--hs-clr:' + rar.color + ';' : ''}">
              ${iconHtml}${effLabel}
            </div>`;
  }).join('');

  el.innerHTML = `
    <div class="gv2-art-container">
      <img class="gv2-art-img" src="img/gauntlet.png" alt="Mystic Gauntlet" draggable="false">
      ${hotspots}
      <button class="gauntlet-mode-overlay-btn" onclick="event.stopPropagation();onPlayGauntletBtn()">
        PLAY GAUNTLET<br>MODE
      </button>
    </div>`;

  // Rarity subtitle line below the title
  const subLine = document.getElementById('gauntletScreenRarityLine');
  if (subLine) {
    const fingers2 = Object.values(equipped).filter(Boolean);
    if (!fingers2.length) {
      subLine.innerHTML = '<span style="color:var(--muted);font-size:11px;letter-spacing:1px;">No rings equipped — spin to get started</span>';
    } else {
      const rar2  = getRarityDef(getGauntletRarityLabel());
      const prob2 = getGauntletRarityPercent();
      const pct2  = (prob2 * 100).toFixed(prob2 < 0.01 ? 4 : prob2 < 0.1 ? 2 : 1);
      subLine.innerHTML = `<span class="${rar2.cls}" style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:2px;">✦ ${rar2.label}</span>`
        + `<span style="color:var(--muted);font-size:11px;letter-spacing:1px;margin-left:10px;">avg ${pct2}% · ${fingers2.length}/5 slots</span>`;
    }
  }
}

// GAUNTLET UI V2 — premium bottom-sheet ring picker
function equipRingToFinger(fingerIdx) {
  const inv = gameState.ringInventory || [];
  if (!inv.length) { showToast('Inventory empty — spin to get rings!','var(--muted)'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'gv2-overlay';

  const panel = document.createElement('div');
  panel.className = 'gv2-panel';

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'gv2-phdr';
  hdr.innerHTML = `
    <div class="gv2-ptitle">✦ ${FINGER_NAMES[fingerIdx]} FINGER</div>
    <button class="gv2-pclose" aria-label="Close">✕</button>`;
  hdr.querySelector('.gv2-pclose').onclick = () => document.body.removeChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) document.body.removeChild(overlay); };

  // Body
  const body = document.createElement('div');
  body.className = 'gv2-pbody';

  const gauntlet     = gameState.gauntlet || {};
  const currentRid   = gauntlet[fingerIdx] || null;

  // Unequip row — shown when this finger already has a ring
  if (currentRid) {
    const curRing = getRingDef(currentRid);
    const curRar  = curRing ? getRarityDef(curRing.rarityId) : null;
    const unequipRow = document.createElement('div');
    unequipRow.style.cssText = [
      'display:flex;align-items:center;gap:11px;padding:11px 12px;',
      'border-radius:12px;margin-bottom:10px;cursor:pointer;',
      'background:rgba(220,40,60,0.10);border:1px solid rgba(220,40,60,0.32);',
      'transition:filter .14s;'
    ].join('');
    unequipRow.innerHTML = `
      <div style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(220,40,60,0.15);font-size:20px;flex-shrink:0;">✕</div>
      <div style="flex:1;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1.5px;color:rgba(255,100,100,0.92);">REMOVE RING</div>
        <div style="font-size:10px;color:rgba(255,100,100,0.55);letter-spacing:1px;margin-top:2px;">${curRing ? curRing.name : 'ring'} — ${FINGER_NAMES[fingerIdx]} finger</div>
      </div>`;
    unequipRow.onclick = () => {
      delete gameState.gauntlet[fingerIdx];
      saveState();
      document.body.removeChild(overlay);
      renderGauntletHand();
      renderMenuGauntletWidget();
      showToast('Ring removed', 'var(--muted)');
    };
    body.appendChild(unequipRow);

    const sep = document.createElement('div');
    sep.style.cssText = 'font-size:9px;color:var(--muted);letter-spacing:2px;text-align:center;padding:2px 0 8px;';
    sep.textContent = '── SWITCH RING ──';
    body.appendChild(sep);
  }

  // Rings already on other fingers cannot be selected (equip-once rule)
  const equippedElsewhere = Object.entries(gauntlet)
    .filter(([slot]) => parseInt(slot) !== fingerIdx)
    .map(([, rid]) => rid)
    .filter(Boolean);

  // Sort by rarity (best first); exclude current ring on this finger & rings on other fingers
  const RORDER = ['secret','legendary','epic','rare','uncommon','common'];
  const unique = [...new Set(inv)]
    .filter(rid => rid !== currentRid && !equippedElsewhere.includes(rid))
    .sort((a, b) => {
      const ra = getRingDef(a)?.rarityId || 'common';
      const rb = getRingDef(b)?.rarityId || 'common';
      return RORDER.indexOf(ra) - RORDER.indexOf(rb);
    });

  if (!unique.length) {
    const empty = document.createElement('div');
    empty.className = 'gv2-pempty';
    empty.textContent = inv.length
      ? 'All your rings are already equipped'
      : 'Inventory empty — spin to get rings!';
    body.appendChild(empty);
  } else {
    unique.forEach(rid => {
      const ring = getRingDef(rid);
      if (!ring) return;
      const rar   = getRarityDef(ring.rarityId);
      const count = inv.filter(r => r === rid).length;
      const row   = document.createElement('div');
      row.className = `gv2-prow gv2-pr-${rar.id}`;
      row.innerHTML = `
        <div class="gv2-pr-icon">${ringImgHtml(ring.rarityId, 40) || ring.emoji}</div>
        <div class="gv2-pr-info">
          <div class="gv2-pr-name">${ring.name}</div>
          <div class="gv2-pr-rar ${rar.cls}">${rar.label}</div>
          ${(()=>{ const e=(typeof gmGetSingleRingEffect==='function')?gmGetSingleRingEffect(rid):null; return e?`<div style="font-size:10px;letter-spacing:1px;color:${rar.color};margin-top:1px;">${e.label} <b>${e.pct}</b></div>`:''; })()}
          ${count > 1 ? `<div class="gv2-pr-cnt">×${count} owned</div>` : ''}
        </div>
        <button class="gv2-pr-equip">EQUIP</button>`;
      const doEquip = () => {
        if (!gameState.gauntlet) gameState.gauntlet = {};
        gameState.gauntlet[fingerIdx] = rid;
        saveState();
        document.body.removeChild(overlay);
        renderGauntletHand();
        renderMenuGauntletWidget();
        checkRingAchievements();
        setTimeout(() => {
          const hs = document.getElementById(`gv2-slot-${fingerIdx}`);
          if (hs) { hs.classList.add('gv2-equip-anim'); setTimeout(() => hs.classList.remove('gv2-equip-anim'), 450); }
        }, 30);
        showToast(`${ring.name} equipped!`, rar.color);
        playSound('achieve');
      };
      row.querySelector('.gv2-pr-equip').onclick = doEquip;
      row.onclick = e => { if (e.target !== row.querySelector('.gv2-pr-equip')) doEquip(); };
      body.appendChild(row);
    });
  }

  panel.appendChild(hdr);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function renderRingInventory() {
  const el = document.getElementById('ringInventoryList');
  if (!el) return;
  const inv = gameState.ringInventory || [];
  document.getElementById('ringInvCount').textContent = inv.length;
  if (!inv.length) { el.innerHTML='<div style="color:var(--muted);font-size:13px;letter-spacing:1px;text-align:center;padding:12px;">Inventory empty</div>'; return; }

  const trades = gameState.activeTrades || {};
  el.innerHTML = '';
  const unique = [...new Set(inv)];
  (unique||[]).forEach(rid => {
    const ring  = getRingDef(rid);
    if (!ring) return;
    const rar   = getRarityDef(ring.rarityId);
    const count = inv.filter(r=>r===rid).length;
    const locked = Object.values(trades).some(t=>t.ringId===rid && Date.now()-t.ts < 4*3600*1000);
    const equippedSlot = Object.entries(gameState.gauntlet||{}).find(([,v])=>v===rid);
    const equippedFinger = equippedSlot ? FINGER_NAMES[parseInt(equippedSlot[0])] : null;
    const row = document.createElement('div');
    row.className = 'ring-inventory-row';
    row.innerHTML = `
      <div class="ring-icon-lg ${rar.cls}">${ringImgHtml(ring.rarityId, 40) || ring.emoji}</div>
      <div class="ring-info">
        <div class="ring-name">${ring.name}${count>1?` ×${count}`:''}</div>
        <div class="ring-rarity ${rar.cls}">${rar.label}</div>
        ${(()=>{ const e=(typeof gmGetSingleRingEffect==='function')?gmGetSingleRingEffect(rid):null; return e?`<div style="font-size:10px;letter-spacing:1px;color:${rar.color};margin-top:2px;">${e.label} <b>${e.pct}</b></div>`:''; })()}
        ${equippedFinger ? `<div style="font-size:9px;letter-spacing:1.5px;color:var(--gold);margin-top:2px;opacity:0.85;">${equippedFinger.toUpperCase()}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:row;gap:5px;flex-shrink:0;align-items:center;">
        ${!locked ? `<button onclick="event.stopPropagation();closeRingInventory();showScreen('tradingScreen');renderTradeScreen();" style="font-size:10px;padding:4px 8px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.3);border-radius:6px;color:var(--diamond);cursor:pointer;letter-spacing:1px;">TRADE</button>` : '<span style="font-size:10px;color:var(--muted);">🔒</span>'}
        <button onclick="event.stopPropagation();salvageRing('${rid}')" style="font-size:10px;padding:4px 8px;background:rgba(255,60,60,0.08);border:1px solid rgba(255,80,80,0.3);border-radius:6px;color:rgba(255,110,110,0.9);cursor:pointer;letter-spacing:1px;">SALVAGE</button>
      </div>`;
    el.appendChild(row);
  });
}

// ── RING ACHIEVEMENTS ────────────────────────────────────────────────
// RING_ACHIEVEMENTS declared at top

// ── RING SALVAGE ──────────────────────────────────────────────────────
function salvageRing(rid) {
  const ring = getRingDef(rid);
  if (!ring) return;
  const rar = getRarityDef(ring.rarityId);
  const SALVAGE_REWARDS = { common:10, uncommon:20, rare:35, epic:50, legendary:100, secret:300 };
  const DIAMONDS = SALVAGE_REWARDS[ring.rarityId] || 10;

  // Confirm overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:1000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:linear-gradient(180deg,#1a0808,#0e0404);border:1px solid rgba(220,50,50,.35);border-radius:18px;padding:24px 20px;max-width:300px;width:90%;text-align:center;box-shadow:0 0 30px rgba(220,50,50,.18);">
      <div style="font-size:30px;margin-bottom:10px;">⚗️</div>
      <div style="font-family:'Cinzel Decorative','Bebas Neue',serif;font-size:15px;letter-spacing:2px;color:rgba(255,120,100,.95);margin-bottom:12px;">SALVAGE RING?</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:12px;">
        ${ringImgHtml(ring.rarityId, 36)}
        <div style="text-align:left;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1px;color:var(--text);">${ring.name}</div>
          <div style="font-size:10px;letter-spacing:2px;" class="${rar.cls}">${rar.label}</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px;letter-spacing:1px;">You will receive <span style="color:var(--diamond);font-weight:bold;">💎 +${DIAMONDS}</span></div>
      <div style="font-size:10px;color:rgba(255,80,80,.6);margin-bottom:18px;letter-spacing:1px;">This ring will be permanently destroyed</div>
      <div style="display:flex;gap:10px;">
        <button id="salvCancelBtn" style="flex:1;padding:10px;border-radius:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--muted);cursor:pointer;font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1.5px;">CANCEL</button>
        <button id="salvConfirmBtn" style="flex:1;padding:10px;border-radius:10px;background:rgba(220,50,50,.15);border:1px solid rgba(220,50,50,.45);color:rgba(255,120,100,.95);cursor:pointer;font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1.5px;">SALVAGE</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#salvCancelBtn').onclick  = () => document.body.removeChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) document.body.removeChild(overlay); };

  overlay.querySelector('#salvConfirmBtn').onclick = () => {
    document.body.removeChild(overlay);

    // Remove one instance from inventory
    const inv = gameState.ringInventory || [];
    const idx = inv.indexOf(rid);
    if (idx !== -1) inv.splice(idx, 1);
    gameState.ringInventory = inv;

    // Remove from gauntlet if equipped
    const g = gameState.gauntlet || {};
    Object.keys(g).forEach(slot => { if (g[slot] === rid) delete g[slot]; });
    gameState.gauntlet = g;

    // Award diamonds
    gameState.diamonds = (gameState.diamonds || 0) + DIAMONDS;
    saveState();
    // Raise server trusted-diamond ceiling so cloud-save integrity check doesn't clamp this
    _addTrustedDiamondsServer(DIAMONDS);

    // Refresh UIs
    try { renderRingInventory(); }       catch(e) {}
    try { renderGauntletHand(); }        catch(e) {}
    try { renderMenuGauntletWidget(); }  catch(e) {}
    ['spinDiamondBalance','storeBalance','profileDiamonds','st-diamonds','statDiamonds'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = (gameState.diamonds || 0).toLocaleString();
    });

    // Success overlay
    const win = document.createElement('div');
    win.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:1000;display:flex;align-items:center;justify-content:center;';
    win.innerHTML = `
      <div style="background:linear-gradient(180deg,#0a180a,#050e05);border:1px solid rgba(0,200,80,.35);border-radius:18px;padding:28px 20px;max-width:280px;width:90%;text-align:center;box-shadow:0 0 30px rgba(0,200,80,.15);">
        <div style="font-size:36px;margin-bottom:12px;">⚗️</div>
        <div style="font-family:'Cinzel Decorative','Bebas Neue',serif;font-size:15px;letter-spacing:2px;color:var(--green);margin-bottom:14px;">RING SALVAGED!</div>
        <div style="font-size:30px;font-family:'Bebas Neue',sans-serif;color:var(--diamond);letter-spacing:2px;margin-bottom:4px;">💎 +${DIAMONDS}</div>
        <div style="font-size:11px;color:var(--muted);letter-spacing:1px;margin-bottom:22px;">Added to your diamond balance</div>
        <button id="salvOkBtn" style="width:100%;padding:12px;border-radius:10px;background:rgba(0,200,80,.15);border:1px solid rgba(0,200,80,.35);color:var(--green);cursor:pointer;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;">OK</button>
      </div>`;
    document.body.appendChild(win);
    win.querySelector('#salvOkBtn').onclick = () => document.body.removeChild(win);
    win.onclick = e => { if (e.target === win) document.body.removeChild(win); };
  };
}

function checkRingAchievements() {
  if (!gameState.ringAchievements) gameState.ringAchievements = {};
  const inv = gameState.ringInventory || [];
  const ra  = gameState.ringAchievements;

  const stats = {
    invSize:   inv.length,
    uncommon:  inv.filter(r=>{const rg=getRingDef(r);return rg&&['uncommon','rare','epic','legendary','secret'].includes(rg.rarityId);}).length,
    rare:      inv.filter(r=>{const rg=getRingDef(r);return rg&&['rare','epic','legendary','secret'].includes(rg.rarityId);}).length,
    epic:      inv.filter(r=>{const rg=getRingDef(r);return rg&&['epic','legendary','secret'].includes(rg.rarityId);}).length,
    legendary: inv.filter(r=>{const rg=getRingDef(r);return rg&&['legendary','secret'].includes(rg.rarityId);}).length,
    secret:    inv.filter(r=>{const rg=getRingDef(r);return rg&&rg.rarityId==='secret';}).length,
    trades:    gameState.tradesDone || 0,
    slotsUsed: Object.values(gameState.gauntlet||{}).filter(Boolean).length,
  };

  const gr = getGauntletRarityLabel();
  if (gr) {
    const idx = RARITY_ORDER.indexOf(gr);
    if (idx <= 3) stats.gauntRare = 1;
    if (idx <= 2) stats.gauntEpic = 1;
    if (idx <= 1) stats.gauntLeg  = 1;
    if (idx <= 0) stats.gauntSec  = 1;
  }

  let earned = false;
  (typeof RING_ACHIEVEMENTS !== "undefined" ? RING_ACHIEVEMENTS : []).forEach(ach => {
    if (ra[ach.id]) return;
    const cur = stats[ach.stat] || 0;
    if (cur >= ach.goal) {
      ra[ach.id] = true;
      gameState.diamonds = (gameState.diamonds||0) + ach.reward;
      _addTrustedDiamondsServer(ach.reward, 'achievement');
      showToast(`🏅 ${ach.label} — +${ach.reward} 💎!`, 'var(--gold)');
      playSound('achieve');
      earned = true;
    }
  });
  if (earned) { saveState(); renderMenuGauntletWidget(); }
  renderRingAchievements();
}

function renderRingAchievements() {
  const el  = document.getElementById('ringAchievements');
  if (!el) return;
  const ra  = gameState.ringAchievements || {};
  const inv = gameState.ringInventory || [];

  const stats = {
    invSize:   inv.length,
    uncommon:  inv.filter(r=>{const rg=getRingDef(r);return rg&&['uncommon','rare','epic','legendary','secret'].includes(rg.rarityId);}).length,
    rare:      inv.filter(r=>{const rg=getRingDef(r);return rg&&['rare','epic','legendary','secret'].includes(rg.rarityId);}).length,
    epic:      inv.filter(r=>{const rg=getRingDef(r);return rg&&['epic','legendary','secret'].includes(rg.rarityId);}).length,
    legendary: inv.filter(r=>{const rg=getRingDef(r);return rg&&['legendary','secret'].includes(rg.rarityId);}).length,
    secret:    inv.filter(r=>{const rg=getRingDef(r);return rg&&rg.rarityId==='secret';}).length,
    trades:    gameState.tradesDone||0,
    slotsUsed: Object.values(gameState.gauntlet||{}).filter(Boolean).length,
  };
  const gr = getGauntletRarityLabel();
  if (gr) {
    const idx=RARITY_ORDER.indexOf(gr);
    if(idx<=3)stats.gauntRare=1;if(idx<=2)stats.gauntEpic=1;if(idx<=1)stats.gauntLeg=1;if(idx<=0)stats.gauntSec=1;
  }

  // Group by category
  const cats = {collect:'📦 Collection', rarity:'💎 Rarity Finds', gauntlet:'🧤 Gauntlet', trade:'🔄 Trading'};
  el.innerHTML = '';
  Object.entries(cats).forEach(([cat, catLabel]) => {
    const achs = RING_ACHIEVEMENTS.filter(a=>a.cat===cat);
    if (!achs.length) return;
    const hdr = document.createElement('div');
    hdr.style.cssText='font-size:10px;color:var(--muted);letter-spacing:2px;padding:6px 0 4px;';
    hdr.textContent = catLabel;
    el.appendChild(hdr);
    (achs||[]).forEach(ach => {
      const done = !!ra[ach.id];
      const cur  = Math.min(stats[ach.stat]||0, ach.goal);
      const pct  = Math.round(cur/ach.goal*100);
      const row  = document.createElement('div');
      row.className = `ring-ach-row ${done?'ring-ach-done':''}`;
      row.innerHTML = `
        <div style="font-size:18px;">${done?'✅':'🏅'}</div>
        <div style="flex:1;">
          <div style="font-size:12px;letter-spacing:1px;">${ach.label}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
            <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${done?'var(--green)':'var(--fire)'};border-radius:2px;transition:width 0.5s;"></div>
            </div>
            <div style="font-size:10px;color:var(--muted);min-width:32px;text-align:right;">${cur}/${ach.goal}</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--gold);min-width:44px;text-align:right;">+${ach.reward}💎</div>`;
      el.appendChild(row);
    });
  });
}

// ── SHARE GAUNTLET ──────────────────────────────────────────────────
function shareGauntlet() {
  const equipped = gameState.gauntlet || {};
  const fingers  = Object.values(equipped).filter(Boolean);
  const rarId    = getGauntletRarityLabel();
  const def      = rarId ? getRarityDef(rarId) : null;
  const prob     = getGauntletRarityPercent();
  const pct      = prob ? (prob*100).toFixed(prob<0.01?4:prob<0.1?2:1) : null;

  const SZ = 500, BAR = 72;
  const canvas = document.createElement('canvas');
  canvas.width = SZ; canvas.height = SZ + BAR;
  const ctx = canvas.getContext('2d');

  // Black base
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SZ, SZ + BAR);

  // Draw gauntlet image, then overlay rarity bar
  function finish() {
    // Bottom rarity bar
    const barBg = ctx.createLinearGradient(0, SZ, 0, SZ + BAR);
    barBg.addColorStop(0, '#050510');
    barBg.addColorStop(1, '#0c0c1e');
    ctx.fillStyle = barBg;
    ctx.fillRect(0, SZ, SZ, BAR);

    // Thin separator line in rarity colour
    ctx.strokeStyle = def ? def.color + '88' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, SZ); ctx.lineTo(SZ, SZ); ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (def && fingers.length) {
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = def.color;
      ctx.shadowColor = def.color; ctx.shadowBlur = 18;
      ctx.fillText('✦ GAUNTLET LEVEL: ' + def.label + ' ✦', SZ/2, SZ + 26);
      ctx.shadowBlur = 0;
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText('avg rarity ' + pct + '% · ' + fingers.length + '/5 slots · Tile Royale', SZ/2, SZ + 52);
    } else {
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText('No rings equipped yet · Tile Royale', SZ/2, SZ + BAR/2);
    }

    // Title strip at top
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, SZ, 38);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8;
    ctx.fillText('MYSTIC GAUNTLET', SZ/2, 22);
    ctx.shadowBlur = 0;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(gameState.playerName || 'Player', SZ/2, 34);

    try {
      const a = document.createElement('a');
      a.download = 'mystic_gauntlet.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
      showToast('📤 Gauntlet image saved!', 'var(--green)');
    } catch(e) {
      showToast('Share unavailable in browser mode', 'var(--muted)');
    }
  }

  // Load and draw gauntlet.png, then call finish()
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { ctx.drawImage(img, 0, 0, SZ, SZ); finish(); };
  img.onerror  = () => { finish(); }; // fallback: just rarity bar on black
  img.src = 'img/gauntlet.png';

}

// ── TRADING SYSTEM ──────────────────────────────────────────────────
function _tradeChecksum(code, ringId) {
  // Simple hash: XOR each char code of code+ringId
  const str = code + '|' + ringId + '|TileRoyale';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).toUpperCase().slice(0, 4);
}

async function createTradeCode(ringId) {
  if ((gameState.level||1) < 10) { showToast('🔒 Unlocks at level 10!', 'var(--muted)'); return; }
  if (!gameState.ringInventory) gameState.ringInventory = [];

  const invIdx = gameState.ringInventory.indexOf(ringId);
  if (invIdx === -1) { showToast('❌ Ring not in inventory!', 'var(--red)'); return; }
  const equippedSlot = Object.values(gameState.gauntlet||{}).indexOf(ringId);
  if (equippedSlot !== -1) { showToast('❌ Unequip ring from gauntlet first!', 'var(--red)'); return; }

  // Find server grantId for this ring if available
  const grantId = Object.entries(gameState.ringGrantMap || {})
    .find(([, rid]) => rid === ringId)?.[0] || null;

  let code = null;

  // Try server-backed trade when grantId exists
  if (grantId && typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
    try {
      const r = await fetch(`${getActiveServer().http}/ring/trade/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, grantId, ringId }),
        signal: AbortSignal.timeout(8000),
      });
      const data = r.ok ? await r.json() : null;
      if (data?.ok && data.tradeCode) {
        code = data.tradeCode;
        // Remove grantId from map — ring is now in trade escrow on server
        if (gameState.ringGrantMap) delete gameState.ringGrantMap[grantId];
      }
    } catch(e) { /* offline — fall through to local code */ }
  }

  // Fallback to local checksum-based code (works same-device or offline)
  if (!code) {
    const base = Math.random().toString(36).substr(2,6).toUpperCase();
    const chk  = _tradeChecksum('TR-RING-' + base, ringId);
    code = 'TR-RING-' + base + '-' + chk;
  }

  if (!gameState.activeTrades) gameState.activeTrades = {};
  gameState.ringInventory.splice(invIdx, 1);
  gameState.activeTrades[code] = { ringId, ts: Date.now(), owner: gameState.playerName||'Player', grantId: grantId || null };
  saveState();
  renderRingInventory();
  renderTradeScreen();
  copyToClipboard(code);
  showToast(`🔄 Code: ${code} — copied to clipboard! Share with friend.`, 'var(--diamond)');
  setTimeout(() => {
    if (document.getElementById('gauntletScreen')?.classList.contains('active')) {
      openTrading();
    }
  }, 800);
}

let _isClaiming = false;

async function acceptTrade() {
  if (_isClaiming) { showToast('⏳ Processing...', 'var(--muted)'); return; }
  const code = (document.getElementById('tradeCodeInput').value||'').trim().toUpperCase();
  const msg  = document.getElementById('tradeMsg');
  if (!code) { msg.textContent='Enter a code'; msg.className='redeem-msg error'; return; }

  _isClaiming = true;
  const claimBtn = document.querySelector('.redeem-btn');
  if (claimBtn) claimBtn.disabled = true;

  // Try server-backed trade first (for codes generated with server grantId)
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
    try {
      const r = await fetch(`${getActiveServer().http}/ring/trade/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimerPlayerId: PLAYER_ID, tradeCode: code }),
        signal: AbortSignal.timeout(8000),
      });
      const data = r.ok ? await r.json() : null;
      if (data?.ok && data.ringId) {
        if (!gameState.ringInventory) gameState.ringInventory = [];
        gameState.ringInventory.push(data.ringId);
        if (data.grantId) {
          if (!gameState.ringGrantMap) gameState.ringGrantMap = {};
          gameState.ringGrantMap[data.grantId] = data.ringId;
        }
        gameState.tradesDone = (gameState.tradesDone||0)+1;
        const ring = getRingDef(data.ringId);
        saveState();
        msg.textContent = `✅ ${ring?.name || data.ringId} added to your inventory!`;
        msg.className = 'redeem-msg success';
        document.getElementById('tradeCodeInput').value = '';
        renderRingInventory(); renderTradeScreen(); checkRingAchievements(); playSound('achieve');
        setTimeout(() => { _isClaiming = false; if (claimBtn) claimBtn.disabled = false; }, 1000);
        return;
      }
      if (data && !data.ok && data.error && data.error !== 'db_unavailable') {
        const errMap = { trade_not_found:'❌ Code not found', already_claimed:'❌ Code already used',
                         trade_expired:'❌ Code expired', self_trade:'❌ Cannot trade with yourself' };
        msg.textContent = errMap[data.error] || '❌ Trade failed';
        msg.className = 'redeem-msg error';
        _isClaiming = false; if (claimBtn) claimBtn.disabled = false;
        return;
      }
    } catch(e) { /* offline or non-server code — fall through to local */ }
  }

  // Local fallback for codes generated without a server grant (offline / legacy)
  const trades = gameState.activeTrades || {};
  const trade  = trades[code];
  if (!trade) { msg.textContent='❌ Code not found'; msg.className='redeem-msg error'; _isClaiming=false; if(claimBtn)claimBtn.disabled=false; return; }

  if (Date.now()-trade.ts > 4*3600*1000) {
    msg.textContent='❌ Code expired'; msg.className='redeem-msg error';
    if (trade.ringId) { if(!gameState.ringInventory)gameState.ringInventory=[]; gameState.ringInventory.push(trade.ringId); }
    delete trades[code]; saveState(); renderTradeScreen();
    _isClaiming=false; if(claimBtn)claimBtn.disabled=false; return;
  }

  const ring = getRingDef(trade.ringId);
  if (!ring) { msg.textContent='❌ Ring not found'; msg.className='redeem-msg error'; _isClaiming=false; if(claimBtn)claimBtn.disabled=false; return; }

  if (!gameState.ringInventory) gameState.ringInventory = [];
  gameState.ringInventory.push(trade.ringId);
  gameState.tradesDone = (gameState.tradesDone||0)+1;
  delete trades[code];
  saveState();

  msg.textContent = `✅ ${ring.name} added to your inventory!`;
  msg.className = 'redeem-msg success';
  document.getElementById('tradeCodeInput').value = '';
  renderRingInventory(); renderTradeScreen(); checkRingAchievements(); playSound('achieve');

  setTimeout(() => { _isClaiming = false; if (claimBtn) claimBtn.disabled = false; }, 1000);
}

function renderTradeScreen() {
  // Trade inventory select
  const selEl = document.getElementById('tradeInventorySelect');
  if (selEl) {
    const inv = [...new Set(gameState.ringInventory||[])];
    selEl.innerHTML = inv.length ? '' : '<div style="color:var(--muted);font-size:12px;letter-spacing:1px;">Inventory empty</div>';
    inv.forEach(rid => {
      const ring=getRingDef(rid); if(!ring)return;
      const rar=getRarityDef(ring.rarityId);
      const row=document.createElement('div'); row.className='ring-inventory-row';
      row.innerHTML=`<div class="ring-icon-lg ${rar.cls}">${ringImgHtml(ring.rarityId, 40) || ring.emoji}</div>
        <div class="ring-info"><div class="ring-name">${ring.name}</div><div class="ring-rarity ${rar.cls}">${rar.label}</div></div>
        <button onclick="createTradeCode('${rid}')" style="font-size:10px;padding:4px 8px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.3);border-radius:6px;color:var(--diamond);cursor:pointer;letter-spacing:1px;flex-shrink:0;">TRADE</button>`;
      selEl.appendChild(row);
    });
  }

  // Active trades
  const activeEl = document.getElementById('activeTradesDisplay');
  if (activeEl) {
    const trades = gameState.activeTrades || {};
    const entries = Object.entries(trades).filter(([,t])=>Date.now()-t.ts<4*3600*1000);
    activeEl.innerHTML = entries.length ? '' : '<div style="color:var(--muted);font-size:12px;letter-spacing:1px;">No active trade codes</div>';
    entries.forEach(([code,trade]) => {
      const remaining = Math.max(0, 4*3600*1000-(Date.now()-trade.ts));
      const h=Math.floor(remaining/3600000), m=Math.floor((remaining%3600000)/60000);
      const ring=getRingDef(trade.ringId); if(!ring)return;
      const row=document.createElement('div'); row.style.cssText='padding:8px 12px;background:var(--panel);border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;gap:10px;';
      row.innerHTML=`<div style="flex:1;"><div class="trade-code-display" onclick="copyToClipboard('${code}')">${code}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px;letter-spacing:1px;">${ring.name} · ${h}h ${m}m remaining</div></div>
        <button onclick="cancelTrade('${code}')" style="font-size:10px;padding:4px 8px;color:var(--red);background:none;border:1px solid rgba(255,51,85,0.3);border-radius:6px;cursor:pointer;">✕</button>`;
      activeEl.appendChild(row);
    });
  }
}

function cancelTrade(code) {
  if (!gameState.activeTrades || !gameState.activeTrades[code]) return;
  const trade = gameState.activeTrades[code];
  // Guaranteed return: ring goes back to inventory
  if (trade && trade.ringId) {
    if (!gameState.ringInventory) gameState.ringInventory = [];
    gameState.ringInventory.push(trade.ringId);
    showToast('❌ Trade cancelled — ring returned to inventory!', 'var(--muted)');
  } else {
    showToast('Trade code cancelled', 'var(--muted)');
  }
  delete gameState.activeTrades[code];
  saveState();
  renderTradeScreen();
  renderRingInventory();
}

// ── OPEN SCREENS ─────────────────────────────────────────────────────
function openGauntlet() {
  clearInterval(_freeSpinCdInterval); _freeSpinCdInterval = null;
  const today = new Date().toDateString();
  if (gameState.spinDate !== today)   { gameState.spinDate=today;   gameState.spinsToday=0;  saveState(); }
  if (gameState.adSpinDate !== today) { gameState.adSpinDate=today; gameState.adSpinsUsed=0; saveState(); }
  updateGauntletSpinUI();
  renderGauntletHand();
  renderRingInventory();
  renderRingAchievements();
  drawSpinWheel();
  showScreen('gauntletScreen');
}

function openTrading() {
  if ((gameState.level||1) < 10) { showToast('🔒 Unlocks at level 10!', 'var(--muted)'); return; }
  renderTradeScreen();
  showScreen('tradingScreen');
}

// AD_SPINS_MAX moved to top

function getAdSpinsUsedToday() {
  const today = new Date().toDateString();
  if (gameState.adSpinDate !== today) {
    gameState.adSpinDate  = today;
    gameState.adSpinsUsed = 0;
    saveState();
  }
  return gameState.adSpinsUsed || 0;
}

async function claimWhaleFreeSpin() {
  const adUsed = getAdSpinsUsedToday();
  if (adUsed >= AD_SPINS_MAX) {
    showToast('🐋 No more free spins today (3/3 used)', 'var(--muted)');
    return;
  }
  if (wheelSpinning) return;

  const { serverRing, serverRarityId, serverGrantId } = await _fetchServerSpin('whaleFreeSpin');

  gameState.adSpinsUsed  = (gameState.adSpinsUsed || 0) + 1;
  gameState.dailyAdSpins = gameState.adSpinsUsed;
  gameState.spinsToday   = (gameState.spinsToday || 0) + 1;
  saveState();
  showToast('🐋 Whale perk — free spin!', 'var(--gold)');
  updateGauntletSpinUI();
  _executeSpin(serverRing, serverRarityId, serverGrantId);
}

async function watchAdForSpin() {
  const adUsed = getAdSpinsUsedToday();
  if (adUsed >= AD_SPINS_MAX) {
    showToast('📺 No more ad spins today (3/3 used)', 'var(--muted)');
    return;
  }
  document.getElementById('adSpinBtn').disabled = true;
  showToast('📺 Loading ad...', 'var(--muted)');
  const rewarded = await _watchRewardedAd();
  document.getElementById('adSpinBtn').disabled = false;
  if (!rewarded) { showToast('Ad not available — try again later', 'var(--muted)'); return; }

  const { serverRing, serverRarityId, serverGrantId } = await _fetchServerSpin('ad');

  gameState.adSpinsUsed  = (gameState.adSpinsUsed || 0) + 1;
  gameState.dailyAdSpins = gameState.adSpinsUsed;
  gameState.spinsToday   = (gameState.spinsToday || 0) + 1;
  saveState();
  showToast('📺 Ad watched — spinning! 🎡', 'var(--gold)');
  updateGauntletSpinUI();
  _executeSpin(serverRing, serverRarityId, serverGrantId);
}

async function _fetchServerSpin(spinType) {
  let serverRing = null, serverRarityId = null, serverGrantId = null;
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
    try {
      const resp = await fetch(`${getActiveServer().http}/ring/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, spinType }),
        signal: AbortSignal.timeout(6000),
      });
      const data = resp.ok ? await resp.json() : null;
      if (data?.ok && data.ringId && data.rarityId) {
        serverRing     = typeof getRingDef === 'function' ? getRingDef(data.ringId) : null;
        serverRarityId = data.rarityId;
        serverGrantId  = data.grantId || null;
      }
    } catch(e) { /* offline — client-side roll fallback */ }
  }
  return { serverRing, serverRarityId, serverGrantId };
}

let _freeSpinCdInterval = null;

function _secsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.floor((midnight - now) / 1000);
}

function _fmtCd(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateGauntletSpinUI() {
  const today = new Date().toDateString();
  if (gameState.spinDate !== today)   { gameState.spinDate=today; gameState.spinsToday=0; gameState.adSpinsUsed=0; saveState(); }
  if (gameState.adSpinDate !== today) { gameState.adSpinDate=today; gameState.adSpinsUsed=0; saveState(); }

  const cost      = getSpinCost();
  const hasFreeSp = (gameState.freeSpins||0) > 0;
  const spins     = gameState.spinsToday || 0;
  const adUsed    = gameState.adSpinsUsed || 0;
  const isAdSpin  = cost === 'ad';
  const isDmdSpin = typeof cost === 'number' && cost > 0;

  // Stats line
  const bal  = document.getElementById('spinDiamondBalance');
  const spEl = document.getElementById('spinsToday');
  if (bal)  bal.textContent  = (gameState.diamonds||0).toLocaleString();
  if (spEl) spEl.textContent = spins;

  // Main spin button — free spin available or cooldown countdown
  const spinBtn = document.getElementById('spinBtn');
  const btnTx   = document.getElementById('spinBtnText');

  clearInterval(_freeSpinCdInterval);
  _freeSpinCdInterval = null;

  if (btnTx) {
    const freeAvailable = hasFreeSp || cost === 0;
    if (freeAvailable) {
      // Free spin ready — restore normal button style
      btnTx.textContent = hasFreeSp ? `Spin (FREE ×${gameState.freeSpins})` : 'Spin (FREE)';
      if (spinBtn) { spinBtn.disabled = false; spinBtn.style.background = ''; spinBtn.style.opacity = ''; }
    } else {
      // Free spin used today — grey button with countdown to midnight reset
      if (spinBtn) {
        spinBtn.disabled = true;
        spinBtn.style.background = 'linear-gradient(135deg,#2a2a38 0%,#1e1e2a 100%)';
        spinBtn.style.opacity = '1';
        spinBtn.style.boxShadow = 'none';
      }
      const tick = () => {
        const secs = _secsUntilMidnight();
        if (secs <= 0) { clearInterval(_freeSpinCdInterval); updateGauntletSpinUI(); return; }
        if (btnTx) btnTx.textContent = `🔒 Free spin in ${_fmtCd(secs)}`;
      };
      tick();
      _freeSpinCdInterval = setInterval(tick, 1000);
    }
  }

  // Ad spin row — show after free spin is used
  const adRow = document.getElementById('adSpinRow');
  const adBtn = document.getElementById('adSpinBtn');
  const adTxt = document.getElementById('adSpinBtnText');
  const adCnt = document.getElementById('adSpinCounter');

  if (adRow) {
    const isWhale   = isPlayerWhale();
    const showAdRow = spins >= 1 && !hasFreeSp;
    adRow.style.display = showAdRow ? 'block' : 'none';

    if (showAdRow) {
      const hdr = adRow.querySelector('div:first-child');
      if (hdr) hdr.textContent = 'GET ANOTHER SPIN:';

      // Diamond cost for display (after ads exhausted) — +50 per gem spin, resets at noon Helsinki
      const dCost = getGemSpinCost();

      // Ad button — whales get free spins without watching an ad
      if (adBtn) {
        const adExhausted = adUsed >= AD_SPINS_MAX;
        adBtn.disabled      = adExhausted;
        adBtn.style.opacity = adExhausted ? '0.35' : '1';
        const icon = adBtn.querySelector('span:first-child');
        if (isWhale) {
          if (icon) icon.textContent = '🐋';
          if (adTxt) adTxt.textContent = adExhausted ? 'NO MORE FREE SPINS TODAY' : 'WHALE PERK — FREE SPIN';
          adBtn.onclick = () => claimWhaleFreeSpin();
        } else {
          if (icon) icon.textContent = '📺';
          if (adTxt) adTxt.textContent = adExhausted ? 'NO MORE ADS TODAY' : 'WATCH AD — FREE SPIN';
          adBtn.onclick = () => watchAdForSpin();
        }
        if (adCnt) {
          adCnt.textContent = `(${adUsed}/${AD_SPINS_MAX})`;
          adCnt.style.color = adExhausted ? 'var(--red)' : '';
        }
      }

      // Diamond button — always available
      const dmdBtn = document.getElementById('adSpinDmdBtn');
      if (dmdBtn) {
        const canAfford = (gameState.diamonds||0) >= dCost;
        dmdBtn.disabled      = !canAfford;
        dmdBtn.style.opacity = canAfford ? '1' : '0.45';
        const lbl  = document.getElementById('adSpinDmdLabel');
        const sub  = document.getElementById('adSpinDmdOwned');
        if (lbl) lbl.textContent = `PAY ${dCost} 💎`;
        if (sub) sub.textContent = `(${(gameState.diamonds||0).toLocaleString()} owned)`;
        // Wire onclick to direct diamond spin
        dmdBtn.onclick = () => {
          if ((gameState.diamonds||0) < dCost) { showToast(`💎 Need ${dCost} diamonds!`,'var(--red)'); return; }
          _auditDiamondSpend('gauntlet_spin', dCost);
          gameState.diamonds -= dCost;
          gameState.spinsToday   = (gameState.spinsToday||0) + 1;
          gameState.gemSpinsToday = (gameState.gemSpinsToday||0) + 1;
          saveState();
          updateGauntletSpinUI();
          _executeSpin();
        };
      }
    }
  }
}

function leaveCustomLobby() {
  clearInterval(customLobbyFillInterval);
  clearInterval(customLobbyPollInterval);
  clearTimeout(customLobbyStartTimeout);
  customLobbyFillInterval = null;
  customLobbyPollInterval = null;
  customLobbyStartTimeout = null;
  customLobbyCode = null;
  customLobbyPlayers = [];
  isCustomLobbyGame = false;
  activeCustomBotSpeedMs = null;
  stopMusic();
  showScreen('menuScreen');
}

function cancelLobby() {
  clearInterval(lobbyInterval);
  clearInterval(lobbyFillInterval);
  clearInterval(customLobbyPollInterval);
  clearInterval(customLobbyFillInterval);
  clearTimeout(lobbySearchTimeout);
  clearTimeout(customLobbyStartTimeout);
  lobbyInterval            = null;
  lobbyFillInterval        = null;
  lobbySearchTimeout       = null;
  customLobbyPollInterval  = null;
  customLobbyFillInterval  = null;
  customLobbyStartTimeout  = null;
  if (currentRoom) { currentRoom.leave(); currentRoom = null; isMultiplayer = false; }

  // Refund ticket if game hasn't started yet (not for custom lobby — no ticket was spent)
  if (gameState.mode !== 'practice' && !roundActive && !isCustomLobbyGame) {
    refundTicket();
    showToast('🎟️ Ticket refunded', 'var(--green)');
  }

  showScreen('menuScreen');
}

function startLobbyCountdown() {
  startMusic('lobby');
  document.getElementById('lobbyStatusWrap').style.display = 'none';
  document.getElementById('lobbyCountdownWrap').style.display = 'block';

  let count = 5;
  document.getElementById('lobbyTimer').textContent = count;
  lobbyInterval = setInterval(() => {
    count--;
    document.getElementById('lobbyTimer').textContent = count;
    if (count <= 0) { clearInterval(lobbyInterval); lobbyInterval = null; startGame(); }
  }, 1000);
}

function _addTrustedDiamondsServer(amount, rewardType) {
  try {
    if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
    if (typeof getActiveServer !== 'function') return;
    if (!amount || amount <= 0) return;
    fetch(`${getActiveServer().http}/ring/reward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: PLAYER_ID, amount, rewardType: rewardType || 'salvage' }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
  } catch(e) {}
}

