// ===================================================================
// GAUNTLET, VIP, TRADING SYSTEMS
// ===================================================================

// ── RING DEFINITIONS (100 unique rings) ────────────────────────────
// RING DATA moved to top
// ═══════════════════════════════════════════════
// JUICE SYSTEM — Game Feel v1.0
// ═══════════════════════════════════════════════

// Pop particle colors per theme
const JUICE_COLORS = {
  default: ['#ff6600','#ff9900','#ffcc00','#ff3300'],
  pimple:  ['#ff8844','#ffcc00','#ffe066','#ff4400'],
  eye:     ['#cc44ff','#4488ff','#ff2244','#ffffff'],
  bug:     ['#66ff00','#00cc44','#aaff44','#ffcc00'],
  cosmic:  ['#8844ff','#4466ff','#ff8800','#ffffff'],
  fruit:   ['#ff2244','#ff6644','#ffcc00','#ff8800'],
};

function getJuiceColors() {
  const theme = gameState.activeTheme || 'default';
  return JUICE_COLORS[theme] || JUICE_COLORS.default;
}

// Tap squash + flash on a tile element
function juiceTileTap(el) {
  if (!el) return;
  el.classList.remove('tap-squash','tap-flash');
  void el.offsetWidth; // reflow
  el.classList.add('tap-squash');
  setTimeout(() => el.classList.remove('tap-squash'), 300);
  // Glow flash
  el.classList.add('tap-flash');
  setTimeout(() => el.classList.remove('tap-flash'), 220);
}

// Pop goo particles when tile is tapped
function juicePopEffect(el) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const gridRect = document.getElementById('tileGrid')?.getBoundingClientRect();
  if (!gridRect) return;
  const cx = rect.left - gridRect.left + rect.width/2;
  const cy = rect.top  - gridRect.top  + rect.height/2;
  const colors = getJuiceColors();
  const grid   = document.getElementById('tileGrid');
  if (!grid) return;

  cinematicTapResponse();
  // Impact ring
  const ring = document.createElement('div');
  ring.className = 'tile-pop-ring';
  ring.style.cssText = `left:${cx}px;top:${cy}px;width:${rect.width*0.8}px;height:${rect.height*0.8}px;border-color:${colors[0]};`;
  grid.appendChild(ring);
  setTimeout(() => ring.remove(), 420);

  // Goo dots — 6-8 random directions
  const count = 6 + Math.floor(Math.random()*3);
  for (let i = 0; i < count; i++) {
    const angle  = (i/count)*Math.PI*2 + Math.random()*0.4;
    const dist   = 28 + Math.random()*22;
    const dx     = Math.cos(angle)*dist;
    const dy     = Math.sin(angle)*dist;
    const sz     = 4 + Math.random()*6;
    const col    = colors[Math.floor(Math.random()*colors.length)];
    const dot    = document.createElement('div');
    dot.className = 'tile-pop-dot';
    dot.style.cssText = `left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;background:${col};
      --dx:${dx}px;--dy:${dy}px;animation-delay:${Math.random()*0.06}s;`;
    grid.appendChild(dot);
    setTimeout(() => dot.remove(), 550);
  }
}

// Heat neighbor glow — tiles adjacent to burning tile glow warmly
function juiceUpdateHeatNeighbors() {
  const gridSize = gameState.gridSize || 25;
  const cols     = Math.round(Math.sqrt(gridSize));
  // Clear all
  for (let i = 0; i < gridSize; i++) {
    document.getElementById('tile-'+i)?.classList.remove('heat-neighbor');
  }
  // Find burning tiles and light up neighbors
  for (let i = 0; i < gridSize; i++) {
    if ((tileStates||[])[i] !== 'burning') continue;
    const row = Math.floor(i/cols), col2 = i%cols;
    [[row-1,col2],[row+1,col2],[row,col2-1],[row,col2+1]].forEach(([r,c]) => {
      if (r>=0 && r<cols && c>=0 && c<cols) {
        const idx = r*cols+c;
        if ((tileStates||[])[idx] === 'idle') {
          document.getElementById('tile-'+idx)?.classList.add('heat-neighbor');
        }
      }
    });
  }
}

// Board atmosphere — floating particles canvas
let _atmosphereFrame = null;
function startBoardAtmosphere() {
  stopBoardAtmosphere();
  const grid = document.getElementById('tileGrid');
  if (!grid) return;
  // Remove old canvas
  document.getElementById('boardAtmosphere')?.remove();
  const canvas = document.createElement('canvas');
  canvas.id = 'boardAtmosphere';
  canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;width:100%;height:100%;';
  grid.style.position = 'relative';
  grid.insertBefore(canvas, grid.firstChild);

  const dpr = window.devicePixelRatio || 1;
  const W = grid.offsetWidth, H = grid.offsetHeight;
  canvas.width = W*dpr; canvas.height = H*dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const colors = getJuiceColors();
  const particles = Array.from({length:18}, () => ({
    x: Math.random()*W, y: Math.random()*H,
    vx: (Math.random()-0.5)*0.4, vy: -0.3-Math.random()*0.5,
    size: 1+Math.random()*2.5,
    alpha: 0.1+Math.random()*0.35,
    col: colors[Math.floor(Math.random()*colors.length)],
    life: Math.random(),
  }));

  function frame() {
    ctx.clearRect(0,0,W,H);
    particles.forEach(p => {
      p.x += p.vx + Math.sin(p.life*3)*0.3;
      p.y += p.vy;
      p.life += 0.006;
      p.alpha = Math.sin(p.life*Math.PI) * 0.35;
      if (p.y < -5 || p.life >= 1) {
        p.x=Math.random()*W; p.y=H+5;
        p.life=0; p.col=colors[Math.floor(Math.random()*colors.length)];
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fillStyle = p.col + Math.floor(p.alpha*255).toString(16).padStart(2,'0');
      ctx.fill();
    });
    _atmosphereFrame = requestAnimationFrame(frame);
  }
  frame();
}

function stopBoardAtmosphere() {
  if (_atmosphereFrame) { cancelAnimationFrame(_atmosphereFrame); _atmosphereFrame = null; }
  document.getElementById('boardAtmosphere')?.remove();
}

// Screen shake on miss
function juiceScreenShake() {
  const grid = document.getElementById('tileGrid');
  if (!grid) return;
  grid.classList.remove('grid-shake');
  void grid.offsetWidth;
  grid.classList.add('grid-shake');
  setTimeout(() => grid.classList.remove('grid-shake'), 320);
}

// ═══════════════════════════════════════════════
// CINEMATIC SYSTEM — Screen-level response
// ═══════════════════════════════════════════════

function initCinematicSystem() {
  // Cinematic system init (overlays removed — caused black screen bug)
}

function cinematicTapResponse() {
  // Subtle camera micro-drift on heavy taps
}

function cinematicImpact() {
  // Camera micro-drift on heavy impact
  const grid = document.getElementById('tileGrid');
  if (grid) {
    grid.classList.remove('impact-drift');
    void grid.offsetWidth;
    grid.classList.add('impact-drift');
    setTimeout(() => grid.classList.remove('impact-drift'), 420);
  }
}

function updateBoardBurningState() {
  const grid = document.getElementById('tileGrid');
  if (!grid) return;
  const hasBurning = (tileStates || []).some(s => s === 'burning');
  grid.classList.toggle('has-burning', hasBurning);
}

// ── LEVEL GATE ──────────────────────────────────────────────────────
function updateFeatureLocks() {
  const lvl = gameState.level || 1;
  const feats = [
    // vipMenuBtn removed (production cleanup)
    // gauntletMenuBtn removed — now a widget, not a button
    { id:'adTicketMenuBtn', minLvl:3, lockLabel:'🔒 +1 TICKET (Lvl 3)' },
    { id:'tradingMenuBtn',  minLvl:10,lockLabel:'🔒 TRADING (Lvl 10)' },
  ];
  (feats||[]).forEach(f => {
    const btn = document.getElementById(f.id);
    if (!btn) return;
    const locked = lvl < f.minLvl;
    btn.classList.toggle('locked', locked);
    btn.disabled = locked;
    if (locked && f.lockLabel) {
      const lbl = btn.querySelector('span:last-child');
      if (lbl) lbl.textContent = f.lockLabel;
    }
  });

  // Gauntlet label restore if unlocked
  const gBtn = document.getElementById('gauntletBtnLabel');
  if (gBtn && lvl >= 3) gBtn.textContent = 'MYSTIC GAUNTLET';
  const tBtn = document.getElementById('tradingBtnLabel');
  if (tBtn && lvl >= 10) tBtn.textContent = 'MARKET & TRADING';
  const aBtn = document.getElementById('adTicketBtnLabel');
  if (aBtn && lvl >= 3) aBtn.textContent = '+1 TICKET (AD)';

  // Update menu gauntlet widget
  renderMenuGauntletWidget();

  // VIP UI removed in production
}

// ── VIP SYSTEM ──────────────────────────────────────────────────────
function toggleVipTest() {
  gameState.isVip = !gameState.isVip;
  saveState();
  updateFeatureLocks();
  updateTicketUI();
  showToast(gameState.isVip ? '👑 VIP activated! +3 tickets, faster refill' : 'VIP deactivated', 'var(--gold)');
}

// Override TICKETS_MAX to account for VIP
function _origGetTicketsMax() {
  const base = 10;
  const vipBonus = gameState.isVip ? 3 : 0;
  const lvlBonus = Math.floor(((gameState.level||1)-1) / 10);
  return base + vipBonus + lvlBonus;
}

// VIP crown in stats bar
function updateVipStatDisplay() {
  const statTickets = document.getElementById('statTickets');
  if (!statTickets) return;
  const crown = statTickets.querySelector('.vip-crown');
  if (gameState.isVip) {
    if (!crown) statTickets.insertAdjacentHTML('beforeend','<span class="vip-crown">👑</span>');
  } else {
    if (crown) crown.remove();
  }
}

// ── LEVEL-UP HOOKS ──────────────────────────────────────────────────
const _origLevelUpHook = window.onLevelUp || null;
function onLevelUp(newLevel) {
  // Free ring spin on every level up
  gameState.freeSpins = (gameState.freeSpins || 0) + 1;
  showToast(`🎉 Level ${newLevel}! 🧤 +1 free Gauntlet spin!`, 'var(--green)');

  // +1 max ticket every 10 levels
  if (newLevel % 10 === 0) {
    showToast(`👑 Level ${newLevel} bonus: +1 permanent ticket capacity!`, 'var(--gold)');
  }

  updateFeatureLocks();
  updateWildItemGates(); // refresh item gates
  saveState();
}

// Hook into existing levelUp function
const _existingLevelUpCheck = window._levelUpNotified;

// ── AD TICKET (LEVEL 5) ─────────────────────────────────────────────
function watchAdForTicketLevel5() {
  if ((gameState.level||1) < 3) { showToast('🔒 Unlocks at level 3!', 'var(--muted)'); return; }
  const overlay = document.getElementById('adLoadingOverlay');
  overlay.classList.add('show');
  let count = 3;
  document.getElementById('adCountdown').textContent = count;
  const tick = setInterval(() => {
    count--;
    document.getElementById('adCountdown').textContent = count;
    if (count <= 0) {
      clearInterval(tick);
      overlay.classList.remove('show');
      const maxT = _origGetTicketsMax();
      gameState.tickets = Math.min(maxT, (gameState.tickets||0) + 1);
      saveState();
      updateTicketUI();
      showToast('🎟️ +1 Ticket from ad!', 'var(--green)');
    }
  }, 1000);
}

// ── SPIN WHEEL ──────────────────────────────────────────────────────
let wheelSpinning = false;
let wheelAngle    = 0;   // degrees — cumulative CW rotation of wheel image
let wheelSegments = [];  // unused (kept for safety)

// Wheel 2.png — 18 equal sectors of 20° each, CW from 12 o'clock (top pointer)
// Actual image positions EMPIRICALLY CONFIRMED via multiple spin tests:
//   0°=GRAY   20°=GREEN  40°=RED   60°=GREEN  80°=GREEN
// 100°=GRAY  120°=GRAY  140°=BLUE 160°=GOLD  180°=RED
// 200°=PURPLE 220°=GRAY 240°=PURPLE 260°=BLUE 280°=GRAY
// 300°=GRAY  320°=PURPLE 340°=GREEN
// Color → rarity: GRAY=common, GREEN=uncommon, BLUE=rare, PURPLE=epic, GOLD=legendary, RED=secret
//
// ROTATION TARGETS = (360 - actual_image_position) % 360
// Rotating CW by X degrees brings sector at (360-X)° to the top pointer.
// VERIFIED: old targets [0,60,140,240] all brought GRAY (0°,300°,220°,120°) ✓
//           targets [80,260] both brought GRAY (280°,100°) ✓
//           target 120 brought PURPLE (240°) ✓
// Sector map calibrated empirically against Wheel 2 new.png
const WHEEL_SECTOR_DEF = {
  common:    [20,  40,  80,  120, 140, 200, 220, 260, 300],
  uncommon:  [0,   60,  100],
  rare:      [160],
  epic:      [240, 340],
  legendary: [180, 320],
  secret:    [280],
};
const WHEEL_SECTOR_HALF = 8; // max jitter within a sector (keeps landing visually inside correct color)


const WHEEL_COLORS = {
  secret:'#ff3355', legendary:'#ffd700', epic:'#9b59b6',
  rare:'#00e5ff', uncommon:'#00ff88', common:'#333344'
};
// Spin model: 1st=FREE, 2nd-4th=AD(max 3 ads), 5th=50💎, 6th=100💎, 7th+=200💎
// DIAMOND_SPIN_COSTS moved to top

function getHelsinkiNoonKey() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('fi-FI', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
  }).formatToParts(now);
  const y = parts.find(p=>p.type==='year').value;
  const m = parts.find(p=>p.type==='month').value;
  const d = parts.find(p=>p.type==='day').value;
  const h = parseInt(parts.find(p=>p.type==='hour').value);
  if (h < 12) {
    const prev = new Intl.DateTimeFormat('fi-FI', {
      timeZone: 'Europe/Helsinki',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(now.getTime() - 86400000));
    return prev.find(p=>p.type==='year').value+'-'+prev.find(p=>p.type==='month').value+'-'+prev.find(p=>p.type==='day').value;
  }
  return `${y}-${m}-${d}`;
}

function getGemSpinCost() {
  const key = getHelsinkiNoonKey();
  if (gameState.gemSpinNoonKey !== key) {
    gameState.gemSpinNoonKey = key;
    gameState.gemSpinsToday  = 0;
    saveState();
  }
  return ((gameState.gemSpinsToday || 0) + 1) * 50;
}

function getSpinCost() {
  const today = new Date().toDateString();
  if (gameState.spinDate !== today) {
    gameState.spinDate    = today;
    gameState.spinsToday  = 0;
    gameState.adSpinsUsed = 0;
    saveState();
  }
  const n       = gameState.spinsToday || 0;
  const adUsed  = gameState.adSpinsUsed || 0;
  if (n === 0)                return 0;       // 1st spin: FREE
  if (adUsed < AD_SPINS_MAX)  return 'ad';    // 2nd-4th: watch ad
  return getGemSpinCost();
}

// drawSpinWheel — now just syncs wheel image rotation (canvas replaced by image)
function drawSpinWheel() {
  const img = document.getElementById('wheelImg');
  if (img) img.style.transform = `rotate(${wheelAngle}deg)`;
}

// _drawSpinWheelCanvas removed: wheel switched to image-based rotation (see drawSpinWheel above)

function rollRingRarity() {
  const r = Math.random();
  let cumul = 0;
  for (const rar of RING_RARITIES) {
    cumul += rar.prob;
    if (r < cumul) return rar.id;
  }
  return 'common';
}

function rollRingForRarity(rarityId) {
  const candidates = RINGS.filter(r => r.rarityId === rarityId);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function spinWheel() {
  if (wheelSpinning) return;
  if ((gameState.level||1) < 3) { showToast('🔒 Unlocks at level 3!','var(--muted)'); return; }

  const cost = getSpinCost();
  const isFree = cost === 0 || (gameState.freeSpins||0) > 0;

  if (!isFree && (gameState.diamonds||0) < cost) {
    showToast(`💎 Not enough diamonds (need ${cost})!`, 'var(--red)'); return;
  }

  // Deduct cost
  if (!isFree) {
    gameState.diamonds -= cost;
    gameState.gemSpinsToday = (gameState.gemSpinsToday || 0) + 1;
  } else if ((gameState.freeSpins||0) > 0) {
    gameState.freeSpins--;
  }
  gameState.spinsToday = (gameState.spinsToday||0) + 1;
  saveState();
  updateGauntletSpinUI();

  _executeSpin();
}

// Core spin animation — uses Wheel 2.png image rotation; reward rarity always matches visual sector
function _executeSpin() {
  if (wheelSpinning) return;

  const rarityId = rollRingRarity();
  const ring     = rollRingForRarity(rarityId);
  const rarDef   = getRarityDef(rarityId);

  // Pick a random matching sector from Wheel 2.png for this rarity, add natural jitter
  const validSectors = WHEEL_SECTOR_DEF[rarityId] || WHEEL_SECTOR_DEF.common;
  const pickedCenter  = validSectors[Math.floor(Math.random() * validSectors.length)];
  const jitter        = (Math.random() - 0.5) * 2 * WHEEL_SECTOR_HALF * 0.75; // ±75% of half-width
  const sectorTargetDeg = ((pickedCenter + jitter) + 360) % 360;

  const startAngle  = wheelAngle;
  const current360  = ((startAngle % 360) + 360) % 360;
  const diff        = (sectorTargetDeg - current360 + 360) % 360;
  const numSpins    = 6 + Math.floor(Math.random() * 3); // 6–8 full rotations
  const finalAngle  = startAngle + numSpins * 360 + diff;

  wheelSpinning = true;
  // Kill any CSS transition so calibration's transition doesn't interfere with JS animation
  const _wImg = document.getElementById('wheelImg');
  if (_wImg) _wImg.style.transition = 'none';
  playSound('wheelspin');
  const spinBtnEl = document.getElementById('spinBtn');
  const adBtnEl   = document.getElementById('adSpinBtn');
  const dmdBtnEl  = document.getElementById('adSpinDmdBtn');
  if (spinBtnEl) spinBtnEl.disabled = true;
  if (adBtnEl)   adBtnEl.disabled  = true;
  if (dmdBtnEl)  dmdBtnEl.disabled = true;
  document.getElementById('spinResult').textContent = '';

  const duration  = 5000;
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);

    // Phase 1 (0–7%): quick acceleration
    // Phase 2 (7–100%): smooth quartic ease-out — no bounce, no overshoot
    let ease;
    if (t < 0.07) {
      ease = (t / 0.07) * 0.05;
    } else {
      const n = (t - 0.07) / 0.93;
      ease = 0.05 + 0.95 * (1 - Math.pow(1 - n, 4));
    }

    wheelAngle = startAngle + (finalAngle - startAngle) * ease;
    const wheelImg = document.getElementById('wheelImg');
    if (wheelImg) wheelImg.style.transform = `rotate(${wheelAngle}deg)`;

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      wheelSpinning = false;
      wheelAngle    = finalAngle;
      if (!gameState.ringInventory) gameState.ringInventory = [];
      gameState.ringInventory.push(ring.id);
      saveState();
      showSpinResult(ring, rarDef);
      renderGauntletHand();
      renderMenuGauntletWidget();
      renderRingInventory();
      checkRingAchievements();
      updateGauntletSpinUI();
    }
  }
  requestAnimationFrame(animate);
}

function showSpinResult(ring, rarDef) {
  // Keep inline result updated (small label below wheel)
  const el = document.getElementById('spinResult');
  if (el) {
    el.innerHTML = `
      <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;vertical-align:middle;">${ringImgHtml(ring.rarityId, 32) || ring.emoji}</span>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;color:${rarDef.color};margin:0 6px;vertical-align:middle;">${ring.name}</span>
      <span style="font-size:10px;color:${rarDef.color};letter-spacing:2px;opacity:0.8;vertical-align:middle;">[${rarDef.label}]</span>`;
  }

  // Flash background for legendary/secret
  const screen = document.getElementById('gauntletScreen');
  if (screen && ['legendary','secret'].includes(rarDef.id)) {
    const flashCls = rarDef.id === 'secret' ? 'spin-win-secret' : 'spin-win-legendary';
    screen.classList.add(flashCls);
    setTimeout(() => screen.classList.remove(flashCls), 1500);
  }

  playSound('achieve');
  if (['legendary','secret'].includes(rarDef.id)) vibrate([100,50,200,50,300]);
  else vibrate([50,30,100]);

  // Show ring won popup
  _showRingWonPopup(ring, rarDef);
}

function _showRingWonPopup(ring, rarDef) {
  const overlay = document.getElementById('ringWonOverlay');
  if (!overlay) return;

  // Populate content
  const imgEl    = document.getElementById('ringWonImg');
  const nameEl   = document.getElementById('ringWonName');
  const rarEl    = document.getElementById('ringWonRarity');
  const descEl   = document.getElementById('ringWonDesc');
  const btnEl    = document.getElementById('ringWonBtn');
  const popupEl  = overlay.querySelector('.ring-won-popup');

  if (imgEl)   imgEl.innerHTML  = ringImgHtml(ring.rarityId, 110) || `<span style="font-size:80px;">${ring.emoji}</span>`;
  if (nameEl)  nameEl.textContent = ring.name;
  if (rarEl) {
    rarEl.textContent   = rarDef.label;
    rarEl.style.color   = rarDef.color;
  }

  // Slot in inventory count
  const total = (gameState.ringInventory || []).filter(id => id === ring.id).length;
  if (descEl) descEl.textContent = total > 1 ? `×${total} in inventory` : 'Added to inventory';

  // Tint popup border to rarity colour
  if (popupEl) popupEl.style.borderColor = rarDef.color + '55';

  // Button colour for legendary/secret
  if (btnEl) {
    if (rarDef.id === 'legendary') { btnEl.style.background = 'linear-gradient(135deg,rgba(255,215,0,0.25),rgba(255,140,0,0.15))'; btnEl.style.borderColor = 'rgba(255,215,0,0.5)'; }
    else if (rarDef.id === 'secret') { btnEl.style.background = 'linear-gradient(135deg,rgba(255,51,85,0.25),rgba(155,0,80,0.15))'; btnEl.style.borderColor = 'rgba(255,51,85,0.5)'; }
    else { btnEl.style.background = ''; btnEl.style.borderColor = ''; }
  }

  overlay.style.display = 'flex';
}

function closeRingWonPopup() {
  const overlay = document.getElementById('ringWonOverlay');
  if (overlay) overlay.style.display = 'none';
}

