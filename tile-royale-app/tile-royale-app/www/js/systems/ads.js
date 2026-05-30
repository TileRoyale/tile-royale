// ===== AD REWARD SYSTEM =====
const AD_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Weighted random item
function rollAdReward() {
  const roll = Math.random() * 100;
  if (roll < 80)  return { type:'tickets',    id:'ticket',     icon:'🎟️', name:'1 Ticket',     qty:1 };
  if (roll < 90)  return { type:'item',       id:'crystal',    icon:'🔮', name:'Crystal Ball', qty:1 };
  if (roll < 97)  return { type:'item',       id:'caltrops',   icon:'⚙️', name:'Caltrops',     qty:1 };
  return               { type:'item',       id:'shadow_tile',icon:'🌑', name:'Shadow Tile',  qty:1 };
}

function canWatchAd() {
  const last = gameState.lastAdWatch || 0;
  return Date.now() - last >= AD_COOLDOWN_MS;
}

function getAdCooldownText() {
  const last = gameState.lastAdWatch || 0;
  const diff = Math.max(0, AD_COOLDOWN_MS - (Date.now() - last));
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `Available in ${m}:${s.toString().padStart(2,'0')}`;
}

// Simulate watching ad (in production: call AdMob rewarded ad here)
function simulateAdWatch(onComplete) {
  showToast('📺 Ad starting...', 'var(--muted)');
  let t = 5;
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
    background:rgba(10,10,15,0.95);border:1px solid var(--border);border-radius:10px;
    padding:12px 20px;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;
    color:var(--text);z-index:999;text-align:center;`;
  toast.innerHTML = `📺 AD PLAYING — ${t}s`;
  document.body.appendChild(toast);
  const tick = setInterval(() => {
    t--;
    toast.innerHTML = `📺 AD PLAYING — ${t}s`;
    if (t <= 0) {
      clearInterval(tick);
      toast.remove();
      onComplete();
    }
  }, 1000);
  // Store tick ref so it can be cancelled if needed
  simulateAdWatch._tick = tick;
}

function giveAdReward(reward) {
  if (reward.type === 'tickets') {
    gameState.tickets = Math.min(TICKETS_MAX, getTickets() + reward.qty);
    gameState.ticketLastUse = gameState.tickets < TICKETS_MAX ? (gameState.ticketLastUse || Date.now()) : null;
  } else {
    addItemToInventory(reward.id, reward.qty);
  }
  gameState.lastAdWatch = Date.now();
  saveState();
  updateMenuStats();
  updateInventoryUI();
  updateTicketUI();
}

// Watch 1 or 3 ads for tickets
let adWatchInProgress = false;

function watchAdsForTickets(count) {
  if (adWatchInProgress) { showToast('Ad already playing...', 'var(--muted)'); return; }
  const adKey = `lastAdTicket_${count}`;
  const last = gameState[adKey] || 0;
  if (Date.now() - last < AD_COOLDOWN_MS) {
    const diff = AD_COOLDOWN_MS - (Date.now() - last);
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    showToast(`Available in ${m}:${s.toString().padStart(2,'0')}`, 'var(--muted)');
    return;
  }

  adWatchInProgress = true;

  if (count === 1) {
    simulateAdWatch(() => {
      adWatchInProgress = false;
      gameState.tickets = Math.min(TICKETS_MAX, getTickets() + 1);
      gameState[adKey] = Date.now();
      saveState(); updateTicketUI(); updateStoreAdTimer();
      showToast('🎟️ +1 Ticket!', 'var(--gold)');
      playSound('achieve');
    });
  } else {
    showToast('📺 Ad 1/3 starting...', 'var(--muted)');
    watchAdChain(3, 0, () => {
      adWatchInProgress = false;
      gameState.tickets = Math.min(TICKETS_MAX, getTickets() + 3);
      gameState[adKey] = Date.now();
      saveState(); updateTicketUI(); updateStoreAdTimer();
      showToast('🎟️🎟️🎟️ +3 Tickets! Well played!', 'var(--gold)');
      playSound('achieve'); vibrate([50, 50, 200]);
    });
  }
}

function watchAdChain(total, done, onComplete) {
  if (done >= total) { onComplete(); return; }
  const num = done + 1;
  // Show brief pause between ads
  setTimeout(() => {
    if (num > 1) showToast(`📺 Ad ${num}/${total}...`, 'var(--muted)');
    simulateAdWatch(() => {
      watchAdChain(total, done + 1, onComplete);
    });
  }, num > 1 ? 800 : 0);
}

// Called from no-tickets box (single ad)
function watchAdForTicket() {
  watchAdsForTickets(1);
}

// Called from store featured
function watchAdForRandomItem() {
  if (!canWatchAd()) {
    showToast(getAdCooldownText(), 'var(--muted)'); return;
  }
  simulateAdWatch(() => {
    const reward = rollAdReward();
    giveAdReward(reward);
    showToast(`🎁 You got: ${reward.icon} ${reward.name}!`, 'var(--gold)');
    playSound('achieve');
    updateStoreAdTimer();
  });
}

function updateStoreAdTimer() {
  const box = document.getElementById('storeAdRewardBox');
  const timer = document.getElementById('storeAdTimer');
  const btn = document.getElementById('storeAdBtn');
  if (!box || !timer) return;
  if (canWatchAd()) {
    box.className = 'ad-reward-box';
    timer.className = 'ad-reward-timer';
    timer.textContent = 'Available now!';
    if (btn) btn.textContent = '▶ WATCH';
  } else {
    box.className = 'ad-reward-box cooldown';
    timer.className = 'ad-reward-timer cooldown-txt';
    timer.textContent = getAdCooldownText();
    if (btn) btn.textContent = '⏱ WAIT';
  }
}

