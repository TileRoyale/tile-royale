// ===== PRACTICE MODE =====
let practiceStartTime = 0;
let practiceTaps = 0;
let practiceWrongTaps = 0;
let practiceTapTimes = [];
let practiceTileIgniteTime = 0;
let practiceLastTile = -1;
let practiceTimerInterval = null;
let practiceSecondsLeft = 30;


async function renderPracticeLeaderboard() {
  const tapLbEl   = document.getElementById('practiceLbTaps');
  const reactLbEl = document.getElementById('practiceLbReaction');
  if (!tapLbEl && !reactLbEl) return;

  const stats      = gameState.achStats || {};
  const playerName = gameState.playerName || 'You';
  const myTaps     = stats.bestPracticeTaps30s || practiceTaps;
  const myReact    = stats.bestPracticeReaction || (practiceTapTimes.length > 0 ? Math.min(...practiceTapTimes) : 0);

  const loading = '<div style="color:var(--muted);font-size:13px;padding:12px 0;text-align:center;">Loading...</div>';
  if (tapLbEl)   tapLbEl.innerHTML   = loading;
  if (reactLbEl) reactLbEl.innerHTML = loading;

  function buildLb(serverRows, myEntry, suffix, betterIsFn, nameKey, valKey) {
    const entries = (serverRows || []).map(r => ({ name: r[nameKey] || 'Player', val: Number(r[valKey]) || 0 }));
    const all = [...entries, myEntry].sort((a, b) => betterIsFn(a, b) ? -1 : 1);
    // Deduplicate — server may already include the player's own personal best
    const seen = new Set();
    const deduped = [];
    for (const e of all) {
      const key = e.isMe ? '__me__' : e.name;
      if (!seen.has(key)) { seen.add(key); deduped.push(e); }
    }
    return deduped.slice(0, 6).map((e, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);${e.isMe?'background:rgba(0,229,255,0.06);border-radius:6px;padding:6px 8px;':''}">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:14px;color:var(--muted);min-width:28px;">${medal}</span>
        <span style="flex:1;font-size:13px;${e.isMe?'color:var(--diamond);font-weight:bold;':''}">${e.name}</span>
        <span style="font-family:'Bebas Neue',sans-serif;font-size:16px;color:${e.isMe?'var(--diamond)':'var(--text)'};">${e.val}${suffix}</span>
      </div>`;
    }).join('');
  }

  try {
    const srv = typeof getActiveServer === 'function' ? getActiveServer() : null;
    const url = srv ? `${srv.http}/practice/leaderboard` : null;
    if (!url) throw new Error('no_server');

    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await resp.json();

    if (tapLbEl) {
      const myEntry = { name: playerName, val: myTaps, isMe: true };
      tapLbEl.innerHTML = buildLb(data.taps, myEntry, ' taps', (a, b) => a.val > b.val, 'player_name', 'best_taps_30s');
    }
    if (reactLbEl && myReact > 0) {
      const myEntry = { name: playerName, val: myReact, isMe: true };
      reactLbEl.innerHTML = buildLb(data.reaction, myEntry, 'ms', (a, b) => a.val < b.val, 'player_name', 'best_reaction_ms');
    } else if (reactLbEl) {
      reactLbEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;text-align:center;">Play to set a reaction time</div>';
    }
  } catch (_e) {
    // Server unreachable — show only the player's own score
    if (tapLbEl && myTaps > 0) {
      tapLbEl.innerHTML = buildLb([], { name: playerName, val: myTaps, isMe: true }, ' taps', (a, b) => a.val > b.val, 'player_name', 'best_taps_30s');
    } else if (tapLbEl) {
      tapLbEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;text-align:center;">No scores yet</div>';
    }
    if (reactLbEl && myReact > 0) {
      reactLbEl.innerHTML = buildLb([], { name: playerName, val: myReact, isMe: true }, 'ms', (a, b) => a.val < b.val, 'player_name', 'best_reaction_ms');
    } else if (reactLbEl) {
      reactLbEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;text-align:center;">No scores yet</div>';
    }
  }
}

function startPractice() {
  gameState.mode = 'practice';
  practiceTaps = 0;
  practiceWrongTaps = 0;
  practiceTapTimes = [];
  practiceStartTime = Date.now();

  showScreen('gameScreen');
  document.getElementById('gameModeBadge').textContent = '🎯 PRACTICE';
  document.getElementById('kothGameBanner').style.display = 'none';
  document.getElementById('itemHud').style.display = 'none';
  document.getElementById('watchBar').classList.remove('show');

  // Replace timer display with tile progress counter
  const timerEl = document.getElementById('gameTimer');
  timerEl.textContent = '0/25';
  timerEl.className = 'game-timer';
  timerEl.style.fontSize = '22px';

  // Add back button to game header
  let backBtn = document.getElementById('practiceBackBtn');
  if (!backBtn) {
    backBtn = document.createElement('button');
    backBtn.id = 'practiceBackBtn';
    backBtn.className = 'btn-secondary';
    backBtn.style.cssText = 'width:auto;padding:6px 12px;font-size:13px;margin-bottom:8px;';
    backBtn.textContent = '← MENU';
    backBtn.onclick = () => {
      clearTimeout(burnTimeout);
      clearInterval(timerInterval);
      timerEl.style.fontSize = '';
      backBtn.remove();
      showScreen('menuScreen');
    };
    document.getElementById('gameScreen').insertBefore(backBtn, document.getElementById('gameScreen').firstChild);
  }

  // Setup 5x5 grid
  const grid = document.getElementById('tileGrid');
  grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
  grid.innerHTML = '';
  tileStates = Array(25).fill('idle');
  for (let i = 0; i < 25; i++) {
    const t = document.createElement('div');
    t.className = 'tile'; t.id = `tile-${i}`;
    t.onclick = () => practiceTapTile(i);
    grid.appendChild(t);
  }

  // No timer — show taps left instead
  document.getElementById('playersLeftCount').textContent = '🎯';
  updatePendingCounter(0);
  applySkins();
  startCountdown(() => { schedulePracticeTile(); });
}

function schedulePracticeTile() {
  clearTimeout(burnTimeout);
  // Reset all tiles immediately — no delay
  tileStates = tileStates.map(() => 'idle');
  for (let i = 0; i < 25; i++) {
    const el = document.getElementById('tile-' + i);
    if (el) { el.className = 'tile'; el.innerHTML = ''; }
  }
  // Pick a new tile — ensure different from last
  let idx;
  do { idx = Math.floor(Math.random() * 25); } while (idx === practiceLastTile && 25 > 1);
  practiceLastTile = idx;

  tileStates[idx] = 'burning';
  const el = document.getElementById('tile-' + idx);
  if (el) el.className = 'tile burning';
  practiceTileIgniteTime = Date.now();
  juiceUpdateHeatNeighbors();

  // Auto-miss after 2.5s
  burnTimeout = setTimeout(() => {
    if (tileStates[idx] === 'burning') {
      tileStates[idx] = 'idle';
      if (el) el.className = 'tile';
      practiceWrongTaps++;
      schedulePracticeTile();
    }
  }, 2500);
}

function practiceTapTile(idx) {
  if (gridLocked) return;
  if (tileStates[idx] !== 'burning') {
    practiceWrongTaps++;
    playSound('wrong'); vibrate(40);
    document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = 'var(--red)'; t.style.opacity = '0.5'; });
    showLockOverlay(700);
    setTimeout(() => {
      document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = ''; t.style.opacity = ''; });
    }, 700);
    return;
  }
  const rt = Date.now() - practiceTileIgniteTime;
  if (!recordReactionTime(rt)) return; // too fast — rejected
  practiceTapTimes.push(rt);
  practiceTaps++;
  playSound('tap'); vibrate(20);
  clearTimeout(burnTimeout);

  // Update progress counter
  document.getElementById('gameTimer').textContent = `${practiceTaps}/25`;
  if (practiceTaps >= 20) document.getElementById('gameTimer').style.color = 'var(--green)';

  tileStates[idx] = 'tapped';
  const el = document.getElementById(`tile-${idx}`);
  if (el) {
    el.className = 'tile tapped'; el.innerHTML = '✓';
    const r = document.createElement('div'); r.className = getTapEffectClass(); el.appendChild(r);
    setTimeout(() => r.remove(), 400);
  }

  if (practiceTaps >= 25) {
    // Done!
    setTimeout(() => {
      document.getElementById('gameTimer').textContent = '25/25';
      document.getElementById('gameTimer').style.color = 'var(--gold)';
      const backBtn = document.getElementById('practiceBackBtn');
      if (backBtn) backBtn.remove();
      document.getElementById('gameTimer').style.fontSize = '';
      endPractice();
    }, 300);
    return;
  }

  setTimeout(() => {
    tileStates[idx]='idle';
    const e=document.getElementById(`tile-${idx}`);
    if(e){e.className='tile';e.innerHTML='';}
    schedulePracticeTile();
  }, 200);
}

function endPractice() {
  clearTimeout(burnTimeout);
  const duration = ((Date.now() - practiceStartTime) / 1000).toFixed(2);
  const totalAttempts = practiceTaps + practiceWrongTaps;
  const accuracy = totalAttempts > 0 ? Math.round(practiceTaps / totalAttempts * 100) : 100;
  const avgReaction = practiceTapTimes.length > 0
    ? Math.round(practiceTapTimes.reduce((a,b)=>a+b,0)/practiceTapTimes.length)
    : 0;

  // Reset game timer display
  const timerEl = document.getElementById('gameTimer');
  timerEl.style.fontSize = '';
  timerEl.style.color = '';

  // Grade based on time to complete + accuracy
  let grade, gradeLabel, tip;
  const durationNum = parseFloat(duration);
  if      (durationNum < 8  && accuracy >= 95) { grade='S'; gradeLabel='PERFECT';    tip='Incredible speed and accuracy — elite tapper!' }
  else if (durationNum < 12 && accuracy >= 90) { grade='A'; gradeLabel='EXCELLENT';  tip='Very fast! Your reactions are sharp.' }
  else if (durationNum < 18 && accuracy >= 80) { grade='B'; gradeLabel='GOOD';       tip='Good speed — work on your accuracy.' }
  else if (durationNum < 25 && accuracy >= 70) { grade='C'; gradeLabel='OK';         tip='Decent — try to be faster and more precise.' }
  else                                          { grade='D'; gradeLabel='KEEP TRYING';tip='Practice makes perfect — try again!' }

  const gradeColors = {S:'#ffd700',A:'#00ff88',B:'#00e5ff',C:'#ff8c00',D:'#ff3355'};

  // Personal best (lowest time)
  const oldBest = gameState.practiceBest || 9999;
  const newBest = durationNum < oldBest;
  if (newBest) { gameState.practiceBest = durationNum; saveState(); }

  // Update leaderboard stat
  if (!gameState.achStats) gameState.achStats = {};
  gameState.achStats.bestPracticeTaps = Math.max(practiceTaps, gameState.achStats.bestPracticeTaps || 0);
  // Store best time for leaderboard (as inverse — more tiles = better; use accuracy score)
  const scoreVal = Math.round((100 / Math.max(1, durationNum)) * (accuracy / 100) * 100);
  gameState.achStats.practiceScore = Math.max(scoreVal, gameState.achStats.practiceScore || 0);
  saveState();

  document.getElementById('practiceGrade').textContent = grade;
  document.getElementById('practiceGrade').style.color = gradeColors[grade];
  document.getElementById('practiceGradeLabel').textContent = gradeLabel;
  document.getElementById('practiceTip').textContent = tip;
  document.getElementById('prTiles').textContent = practiceTaps;
  document.getElementById('prAccuracy').textContent = accuracy + '%';
  document.getElementById('prAvgSpeed').textContent = avgReaction + 'ms';
  document.getElementById('prDuration').textContent = duration + 's';

  const pbRow = document.getElementById('prPbRow');
  if (newBest) {
    pbRow.style.display = 'block';
    document.getElementById('prPbVal').textContent = `${duration}s — new best time!`;
  } else {
    pbRow.style.display = 'none';
  }

  showScreen('practiceResultScreen');
  playSound(grade === 'S' || grade === 'A' ? 'victory' : 'tap');

  // Submit best scores to server leaderboard (fire-and-forget)
  _submitPracticeScore(practiceTaps, avgReaction);
}

function _submitPracticeScore(taps, reactionMs) {
  try {
    if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
    if (typeof getActiveServer !== 'function') return;
    fetch(`${getActiveServer().http}/practice/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId:    PLAYER_ID,
        playerName:  gameState.playerName || 'Player',
        avatar:      (typeof getActiveAvatar === 'function' ? getActiveAvatar().icon : null) || '🔥',
        taps30s:     taps,
        reactionMs:  reactionMs,
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
  } catch(e) {}
}

