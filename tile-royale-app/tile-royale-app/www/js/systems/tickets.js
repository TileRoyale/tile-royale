// ===== TICKET SYSTEM =====
const TICKETS_MAX = 10;
const TICKET_REFILL_MS = 60 * 60 * 1000; // 1 hour
let ticketRefillInterval = null;

function getTickets() {
  return gameState.tickets !== undefined ? gameState.tickets : _origGetTicketsMax();
}

function useTicket() {
  if (getTickets() <= 0) return false;
  gameState.tickets = getTickets() - 1;
  if (!gameState.ticketLastUse) gameState.ticketLastUse = Date.now();
  saveState();
  updateTicketUI();
  try { trackMissionEvent('ticket_used', {}); } catch(e) {}
  return true;
}

function checkTicketRefill() {
  if (getTickets() >= TICKETS_MAX) {
    gameState.ticketLastUse = null;
    saveState();
    return;
  }
  const last = gameState.ticketLastUse;
  if (!last) return;
  const elapsed = Date.now() - last;
  const refills = Math.floor(elapsed / TICKET_REFILL_MS);
  if (refills > 0) {
    const newCount = Math.min(TICKETS_MAX, getTickets() + refills);
    gameState.tickets = newCount;
    gameState.ticketLastUse = newCount >= TICKETS_MAX ? null : last + refills * TICKET_REFILL_MS;
    saveState();
    if (newCount > 0) showToast(`🎟️ ${refills} ticket${refills>1?'s':''} refilled!`, 'var(--green)');
  }
}

function getTicketRefillTime() {
  if (getTickets() >= TICKETS_MAX) return null;
  const last = gameState.ticketLastUse || Date.now();
  const nextRefill = last + TICKET_REFILL_MS;
  const diff = Math.max(0, nextRefill - Date.now());
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${s.toString().padStart(2,'0')}`;
}

function updateTicketUI() {
  const tickets = getTickets();
  const counter = document.getElementById('menuTicketCounter');
  const noBox   = document.getElementById('noTicketsBox');
  const playBtn = document.getElementById('btnFindMatch');

  if (counter) {
    counter.textContent = `🎟️ ${tickets}`;
    counter.className = 'ticket-counter' + (tickets <= 2 ? ' low' : '');
  }
  // btnFindMatch is now always hidden (play button lives in mode popup)
  if (playBtn) playBtn.style.display = 'none';
  if (noBox) {
    if (tickets <= 0) {
      noBox.style.display = 'block';
      updateNoTicketsTimer();
    } else {
      noBox.style.display = 'none';
    }
  }
  // Keep mode popup ticket counter in sync
  const modeCounter = document.getElementById('modePopupTicketCounter');
  if (modeCounter && gameState && gameState.mode !== 'practice') {
    modeCounter.textContent = `🎟️ ${tickets}`;
    modeCounter.className = 'ticket-counter' + (tickets <= 2 ? ' low' : '');
  }
}

function updateNoTicketsTimer() {
  const el = document.getElementById('noTicketsTimer');
  if (!el) return;
  const t = getTicketRefillTime();
  el.textContent = t ? `Next ticket in ${t}` : 'Refilling...';
}

// Override findMatch with ticket check
function tryFindMatch() {
  checkTicketRefill();
  if (gameState.mode === 'practice') { findMatch(); return; }
  if (getTickets() <= 0) {
    updateTicketUI();
    return;
  }
  useTicket();
  findMatch();
}

function refundTicket() {
  // Only refund if lobby hasn't started a game yet
  gameState.tickets = Math.min(TICKETS_MAX, getTickets() + 1);
  saveState();
  updateTicketUI();
}

