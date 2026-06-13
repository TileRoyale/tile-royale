// ===== ACHIEVEMENTS SYSTEM =====
const ACHIEVEMENTS = [
  // BRONZE
  { id:'first_blood',    tier:'bronze',  icon:'🩸', name:'First Blood',        desc:'Play your first game',                         goal:1,  stat:'games' },
  { id:'tapper',         tier:'bronze',  icon:'👆', name:'Tapper',             desc:'Tap 100 tiles total',                           goal:100, stat:'totalTaps' },
  { id:'survivor',       tier:'bronze',  icon:'🛡️', name:'Survivor',           desc:'Finish in top 5 in one game',                  goal:1,  stat:'top5' },
  { id:'speed_demon',    tier:'bronze',  icon:'⚡', name:'Speed Demon',        desc:'Win a Rush mode game',                          goal:1,  stat:'rushWins' },
  { id:'buckshot_rookie',tier:'bronze',  icon:'💥', name:'Buckshot Rookie',    desc:'Play 5 Buckshot games',                        goal:5,  stat:'buckshotGames' },
  { id:'wild_card',      tier:'bronze',  icon:'🌀', name:'Wild Card',          desc:'Play 1 Wild mode game',                        goal:1,  stat:'wildGames' },
  // SILVER
  { id:'on_fire',        tier:'silver',  icon:'🔥', name:'On Fire',            desc:'Win 10 games',                                  goal:10,  stat:'wins' },
  { id:'tile_hunter',    tier:'silver',  icon:'🎯', name:'Tile Hunter',        desc:'Tap 1000 tiles total',                          goal:1000, stat:'totalTaps' },
  { id:'hat_trick',      tier:'silver',  icon:'🎩', name:'Hat Trick',          desc:'Win 3 games in a row',                         goal:3,  stat:'winStreak' },
  { id:'fashionista',    tier:'silver',  icon:'💄', name:'Fashionista',        desc:'Buy 5 skins',                                  goal:5,  stat:'skinsBought' },
  { id:'loaded',         tier:'silver',  icon:'💰', name:'Loaded',             desc:'Collect 10 000 diamonds total',                goal:10000, stat:'totalDiamonds' },
  { id:'wild_master',    tier:'silver',  icon:'🌪️', name:'Wild Master',       desc:'Win 10 Wild mode games',                       goal:10, stat:'wildWins' },
  // GOLD
  { id:'centurion',      tier:'gold',    icon:'⚔️', name:'Centurion',          desc:'Win 100 games',                                goal:100, stat:'wins' },
  { id:'diamond_hands',  tier:'gold',    icon:'🙌', name:'Diamond Hands',      desc:'Collect 100 000 diamonds total',               goal:100000, stat:'totalDiamonds' },
  { id:'buckshot_king',  tier:'gold',    icon:'👑', name:'Buckshot King',      desc:'Win 50 Buckshot games',                        goal:50, stat:'buckshotWins' },
  { id:'skin_collector', tier:'gold',    icon:'🎨', name:'Skin Collector',     desc:'Buy 20 skins',                                 goal:20, stat:'skinsBought' },
  { id:'last_standing',  tier:'gold',    icon:'🏅', name:'Last Man Standing',  desc:'Finish top 3 100 times',                       goal:100, stat:'top3' },
  { id:'unstoppable',    tier:'gold',    icon:'🚀', name:'Unstoppable',        desc:'Win 10 games in a row',                        goal:10, stat:'winStreak' },
  // DIAMOND
  { id:'tile_legend',    tier:'diamond', icon:'💎', name:'Tile Legend',        desc:'Tap 100 000 tiles total',                      goal:100000, stat:'totalTaps' },
  { id:'grand_master',   tier:'diamond', icon:'🏆', name:'Grand Master',       desc:'Win 500 games',                                goal:500, stat:'wins' },
  { id:'the_collector',  tier:'diamond', icon:'🗂️', name:'The Collector',      desc:'Buy all skins',                                goal:36, stat:'skinsBought' },
  { id:'diamond_lord',   tier:'diamond', icon:'👸', name:'Diamond Lord',       desc:'Collect 1 000 000 diamonds total',             goal:1000000, stat:'totalDiamonds' },
  { id:'untouchable',    tier:'diamond', icon:'👻', name:'Untouchable',        desc:'Win 50 games in a row',                        goal:50, stat:'winStreak' },
  { id:'true_champion',  tier:'diamond', icon:'🌟', name:'True Champion',      desc:'Finish top 3 1000 times',                     goal:1000, stat:'top3' },
  // SECRET
  { id:'ghost_tap',       tier:'secret', icon:'👁️', name:'Ghost Tap',         desc:'??????', secret:true, goal:1, stat:'_secret' },
  { id:'konami',          tier:'secret', icon:'🎮', name:'Konami',             desc:'??????', secret:true, goal:1, stat:'_secret' },
  { id:'night_owl',       tier:'secret', icon:'🦉', name:'Night Owl',          desc:'??????', secret:true, goal:1, stat:'_secret' },
  { id:'early_bird',      tier:'secret', icon:'🌅', name:'Early Bird',         desc:'??????', secret:true, goal:1, stat:'_secret' },
  { id:'treasure_hunter', tier:'secret', icon:'💰', name:'Treasure Hunter',    desc:'??????', secret:true, goal:1, stat:'_secret' },
  { id:'the_watcher',     tier:'secret', icon:'👀', name:'The Watcher',        desc:'??????', secret:true, goal:1, stat:'_secret' },
  { id:'midas_touch',     tier:'secret', icon:'✨', name:'Midas Touch',        desc:'??????', secret:true, goal:1, stat:'_secret' },
  { id:'back_door',       tier:'secret', icon:'🚪', name:'Back Door',          desc:'??????', secret:true, goal:1, stat:'_secret' },
  { id:'lucky_seven',     tier:'secret', icon:'🍀', name:'Lucky Seven',        desc:'??????', secret:true, goal:1, stat:'_secret' },
  { id:'phantom',         tier:'secret', icon:'🌀', name:'Phantom',            desc:'??????', secret:true, goal:1, stat:'_secret' },
  // SOLO
  /* OLD solo achievements — max 100 levels, max 300 stars
  { id:'solo_first',    tier:'bronze',  icon:'🎯', name:'First Solo',        desc:'Complete your first Solo level',             goal:1,   stat:'soloLevels' },
  { id:'solo_rookie',   tier:'bronze',  icon:'🏃', name:'Solo Rookie',        desc:'Complete 10 Solo levels',                   goal:10,  stat:'soloLevels' },
  { id:'solo_warrior',  tier:'silver',  icon:'⚔️', name:'Solo Warrior',       desc:'Complete 25 Solo levels',                   goal:25,  stat:'soloLevels' },
  { id:'solo_veteran',  tier:'silver',  icon:'🎖️', name:'Solo Veteran',       desc:'Complete 50 Solo levels',                   goal:50,  stat:'soloLevels' },
  { id:'solo_master',   tier:'gold',    icon:'🏆', name:'Solo Master',         desc:'Complete all 100 Solo levels',              goal:100, stat:'soloLevels' },
  { id:'solo_stars30',  tier:'bronze',  icon:'⭐', name:'Star Seeker',         desc:'Collect 30 Solo stars',                     goal:30,  stat:'soloStars'  },
  { id:'solo_stars100', tier:'silver',  icon:'🌟', name:'Star Hunter',         desc:'Collect 100 Solo stars',                    goal:100, stat:'soloStars'  },
  { id:'solo_stars200', tier:'silver',  icon:'💫', name:'Star Collector',      desc:'Collect 200 Solo stars',                    goal:200, stat:'soloStars'  },
  { id:'solo_perfect',  tier:'diamond', icon:'💎', name:'Perfectionist',       desc:'Collect all 300 Solo stars',                goal:300, stat:'soloStars'  },
  { id:'solo_flawless', tier:'silver',  icon:'✨', name:'Flawless',             desc:'Complete 10 levels with 3 stars each',      goal:10,  stat:'solo3Stars' },
  */
  // NEW solo achievements — 1000 levels
  { id:'solo_first',       tier:'bronze',  icon:'🎯', name:'First Solo',         desc:'Complete your first Solo level',             goal:1,    stat:'soloLevels'       },
  { id:'solo_rookie',      tier:'bronze',  icon:'🏃', name:'Solo Rookie',         desc:'Complete 10 Solo levels',                   goal:10,   stat:'soloLevels'       },
  { id:'solo_warrior',     tier:'silver',  icon:'⚔️', name:'Solo Warrior',        desc:'Complete 25 Solo levels',                   goal:25,   stat:'soloLevels'       },
  { id:'solo_veteran',     tier:'silver',  icon:'🎖️', name:'Solo Veteran',        desc:'Complete 50 Solo levels',                   goal:50,   stat:'soloLevels'       },
  { id:'solo_master',      tier:'gold',    icon:'🏆', name:'Solo Master',          desc:'Complete 100 Solo levels',                  goal:100,  stat:'soloLevels'       },
  { id:'solo_explorer',    tier:'gold',    icon:'🗺️', name:'Solo Explorer',        desc:'Complete 250 Solo levels',                  goal:250,  stat:'soloLevels'       },
  { id:'solo_champion',    tier:'gold',    icon:'🥇', name:'Solo Champion',        desc:'Complete 500 Solo levels — halfway there!', goal:500,  stat:'soloLevels'       },
  { id:'solo_legend',      tier:'diamond', icon:'👑', name:'Solo Legend',          desc:'Complete all 1000 Solo levels',             goal:1000, stat:'soloLevels'       },
  { id:'solo_void10',      tier:'bronze',  icon:'💜', name:'Void Rookie',           desc:'Defuse 10 void bombs',                      goal:10,   stat:'soloVoidDefused'  },
  { id:'solo_void100',     tier:'silver',  icon:'🟣', name:'Void Hunter',           desc:'Defuse 100 void bombs',                     goal:100,  stat:'soloVoidDefused'  },
  { id:'solo_void500',     tier:'gold',    icon:'💜', name:'Void Master',           desc:'Defuse 500 void bombs',                     goal:500,  stat:'soloVoidDefused'  },
  { id:'solo_dbl25',       tier:'bronze',  icon:'⚡', name:'Quick Tap',             desc:'Land 25 double-taps',                       goal:25,   stat:'soloDoubleTaps'   },
  { id:'solo_dbl200',      tier:'silver',  icon:'⚡', name:'Double Trouble',        desc:'Land 200 double-taps',                      goal:200,  stat:'soloDoubleTaps'   },
  { id:'solo_chain10',     tier:'bronze',  icon:'🔗', name:'Chainer',               desc:'Complete 10 colour chains',                 goal:10,   stat:'soloChains'       },
  { id:'solo_chain100',    tier:'silver',  icon:'🔗', name:'Chain Reaction',        desc:'Complete 100 colour chains',                goal:100,  stat:'soloChains'       },
  { id:'solo_nodmg1',      tier:'bronze',  icon:'🛡️', name:'Unscathed',             desc:'Complete a level without losing a life',    goal:1,    stat:'soloNoLifeLevels' },
  { id:'solo_nodmg25',     tier:'silver',  icon:'🛡️', name:'Ironclad',              desc:'Complete 25 levels without losing a life',  goal:25,   stat:'soloNoLifeLevels' },
  { id:'solo_nodmg100',    tier:'gold',    icon:'💎', name:'Invincible',            desc:'Complete 100 levels without losing a life', goal:100,  stat:'soloNoLifeLevels' },
  // WHALE — only for big spenders
  { id:'whale_1',    tier:'whale', icon:'🐋', name:'First Splash',      desc:'Purchase any diamond package',             goal:1,   stat:'diamondsPurchased' },
  { id:'whale_2',    tier:'whale', icon:'💸', name:'High Roller',       desc:'Spend 9.99€ or more in a single purchase', goal:999, stat:'singlePurchaseMax' },
  { id:'whale_3',    tier:'whale', icon:'👑', name:'The Patron',        desc:'Spend a total of 19.99€ on diamonds',      goal:1999, stat:'totalSpentCents' },
  { id:'whale_4',    tier:'whale', icon:'🌊', name:'Deep Waters',       desc:'Own 15 or more skins',                     goal:15,  stat:'skinsBought' },
  { id:'whale_5',    tier:'whale', icon:'🏰', name:'The Collector King',desc:'Buy every bundle in the store',            goal:4,   stat:'bundlesBought' },
  { id:'whale_6',    tier:'whale', icon:'⚡', name:'Power Spender',     desc:'Spend 49.99€ total — join the elite',      goal:4999, stat:'totalSpentCents' },
  { id:'whale_7',    tier:'whale', icon:'🌌', name:'Galaxy Brain',      desc:'Own every skin in the game',               goal:36,  stat:'skinsBought' },
  { id:'whale_8',    tier:'whale', icon:'🔱', name:'Lord of the Tiles', desc:'Spend 99.99€ total — true whale status',   goal:9999, stat:'totalSpentCents' },
  { id:'whale_song', tier:'whale', icon:'🎵', name:'Whale Song',        desc:'Play a real multiplayer game with at least 3 other whale players',   goal:1,    stat:'whaleSongGames' },
  { id:'moby_dick',  tier:'whale', icon:'🐋', name:'Moby Dick',         desc:'Beat a whale player in a 1v1 final',                goal:1,    stat:'mobyDickWins' },
];

// Init achievement stats in gameState
function initAchStats() {
  if (!gameState.achStats) gameState.achStats = {};
  if (!gameState.unlockedAch) gameState.unlockedAch = [];
  const s = gameState.achStats;
  ['games','wins','totalTaps','top5','top3','rushWins','buckshotGames','buckshotWins',
   'wildGames','wildWins','totalDiamonds','skinsBought','winStreak','bestWinStreak',
   'diamondsPurchased','totalSpentCents',
   'soloLevels','soloVoidDefused','soloDoubleTaps','soloChains','soloNoLifeLevels',
   'soloHighestLevel'
  ].forEach(k => { if (s[k] === undefined) s[k] = 0; });
}

// Diamond exclusive skins (only earnable via achievements)
const DIAMOND_EXCLUSIVE_SKINS = [
  { tab:'tileeffect', id:'fx_void',      name:'Void',          icon:'🌑' },
  { tab:'tileeffect', id:'fx_rainbow',   name:'Rainbow',       icon:'🌈' },
  { tab:'tapeffect',  id:'tap_portal',   name:'Portal',        icon:'🌀' },
  { tab:'table',      id:'table_galaxy', name:'Galaxy',        icon:'🌌' },
  { tab:'tile',       id:'tile_holo',    name:'Hologram',      icon:'🔷' },
  { tab:'table',      id:'table_toxic',  name:'Toxic Waste',   icon:'☢️' },
];

// Whale-only exclusive skins — only from whale bundles/achievements
const WHALE_EXCLUSIVE_SKINS = [
  { tab:'table',      id:'table_obsidian', name:'Obsidian',     icon:'⬛' },
  { tab:'table',      id:'table_aurora',   name:'Aurora',       icon:'🌠' },
  { tab:'tile',       id:'tile_diamond',   name:'Diamond',      icon:'💎' },
  { tab:'tile',       id:'tile_obsidian',  name:'Obsidian',     icon:'🖤' },
  { tab:'tileeffect', id:'fx_godray',      name:'God Ray',      icon:'✨' },
  { tab:'tileeffect', id:'fx_blackhole',   name:'Black Hole',   icon:'🌀' },
  { tab:'tapeffect',  id:'tap_shockwave',  name:'Shockwave',    icon:'💫' },
  { tab:'tapeffect',  id:'tap_goldcrack',  name:'Gold Crack',   icon:'🥇' },
];

const ACH_REWARDS = {
  bronze:  { diamonds: 3,    items: 0, exclusiveSkin: false },
  silver:  { diamonds: 8,    items: 1, exclusiveSkin: false },
  gold:    { diamonds: 20,   items: 2, exclusiveSkin: false },
  diamond: { diamonds: 50,   items: 3, exclusiveSkin: true  },
  secret:  { diamonds: 15,   items: 1, exclusiveSkin: false },
  whale:   { diamonds: 500,  items: 5, exclusiveSkin: true, whaleBadge: true },
};

// Deterministic hash so the same achievement always yields the same items.
// Prevents save-scumming: reloading before claim gives the same result.
function _achHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

function giveAchievementReward(ach) {
  const reward = ACH_REWARDS[ach.tier];
  if (!reward) return null;

  const itemKeys = Object.keys(ITEM_TYPES);
  const itemsGiven = [];
  // Deterministic item selection keyed on achievementId + slot index.
  // Same achievement always grants the same item regardless of when it is claimed.
  for (let i = 0; i < reward.items; i++) {
    const itemId = itemKeys[_achHash(ach.id + '_item' + i) % itemKeys.length];
    itemsGiven.push({ id: itemId, def: ITEM_TYPES[itemId] });
  }

  // Deterministic exclusive skin selection
  let exclusiveSkin = null;
  if (reward.exclusiveSkin) {
    const unowned = DIAMOND_EXCLUSIVE_SKINS.filter(s => !(gameState.ownedSkins && gameState.ownedSkins[s.id]));
    if (unowned.length > 0) {
      exclusiveSkin = unowned[_achHash(ach.id + '_skin') % unowned.length];
    }
  }

  // Apply everything at once then save once
  gameState.diamonds += reward.diamonds;
  itemsGiven.forEach(({ id }) => addItemToInventory(id, 1));
  if (exclusiveSkin) {
    if (!gameState.ownedSkins) gameState.ownedSkins = {};
    gameState.ownedSkins[exclusiveSkin.id] = true;
  }

  saveState();
  updateMenuStats();
  updateInventoryUI();

  return { diamonds: reward.diamonds, items: itemsGiven.map(x => x.def), exclusiveSkin };
}

async function unlockAchievement(id) {
  initAchStats();
  if (gameState.unlockedAch.includes(id)) return;

  // Optimistically lock to prevent concurrent duplicate calls
  gameState.unlockedAch.push(id);

  // Server-side idempotency — if already recorded, restore state without re-granting reward
  let alreadyUnlocked = false;
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
    try {
      const resp = await fetch(`${getActiveServer().http}/achievements/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, achievementId: id }),
        signal: AbortSignal.timeout(6000),
      });
      const data = resp.ok ? await resp.json() : null;
      if (data && !data.ok && !data.offline && data.error === 'already_unlocked') {
        alreadyUnlocked = true;
      }
    } catch(e) { /* offline — allow local grant */ }
  }

  const ach = ACHIEVEMENTS.find(a => a.id === id);
  if (!ach) { saveState(); return; }

  if (!alreadyUnlocked) {
    const reward = giveAchievementReward(ach);
    const linkedAvatars = ALL_AVATARS.filter(av => av.unlock === ach.id);
    (linkedAvatars||[]).forEach(av => unlockAvatar(av.id));
    saveState();
    playSound('achieve');
    showAchievementPopup(ach, reward);
  } else {
    saveState();
  }
  _syncProgress();
}

function showAchievementPopup(ach, reward) {
  const tierColors = {
    bronze: '#cd7f32', silver: '#c0c0c0',
    gold: '#ffd700', diamond: '#00e5ff', secret: '#b464ff'
  };
  const color = tierColors[ach.tier] || '#ffd700';
  const tierLabels = { bronze:'🥉 Bronze', silver:'🥈 Silver', gold:'🥇 Gold', diamond:'💎 Diamond', secret:'🔐 Secret' };

  document.getElementById('achPopupIcon').textContent = ach.icon;
  document.getElementById('achPopupIcon').style.background = color + '22';
  document.getElementById('achPopupIcon').style.boxShadow = `0 0 24px ${color}66`;
  document.getElementById('achPopupName').textContent = ach.name;
  document.getElementById('achPopupName').style.color = color;
  document.getElementById('achPopupTier').textContent = tierLabels[ach.tier];
  document.getElementById('achPopupTier').style.color = color;

  // Show real description (even for secrets)
  const realDesc = {
    ghost_tap:       'Tap the TILE ROYALE logo 5 times rapidly',
    konami:          'Tap the 💎 diamond icon 7 times',
    night_owl:       'Open the game between midnight and 4am',
    early_bird:      'Open the game between 5am and 7am',
    treasure_hunter: 'Find the hidden tile in the main menu',
    the_watcher:     'Spectate 30 games after being eliminated',
    midas_touch:     'Find the hidden tile on the result screen',
    back_door:       'Tap your player name 3 times rapidly',
    lucky_seven:     'Have exactly 777 diamonds in your wallet',
    phantom:         'Find the hidden tile on the Wild screen',
  };
  document.getElementById('achPopupDesc').textContent = realDesc[ach.id] || ach.desc;

  // Rewards
  let rewardHTML = `<div class="ach-popup-reward">💎 +${reward.diamonds.toLocaleString()}</div>`;
  (reward.items||[]).forEach(item => {
    rewardHTML += `<div class="ach-popup-reward">${item.icon} +1 ${item.name}</div>`;
  });
  if (reward.exclusiveSkin) {
    rewardHTML += `<div class="ach-popup-reward exclusive">${reward.exclusiveSkin.icon} Exclusive: ${reward.exclusiveSkin.name}!</div>`;
  }
  document.getElementById('achPopupRewards').innerHTML = rewardHTML;

  document.getElementById('achPopupOverlay').classList.add('show');
}

function checkAchievements() {
  initAchStats();
  const s = gameState.achStats;
  const u = gameState.unlockedAch;
  ACHIEVEMENTS.filter(a => !a.secret && !u.includes(a.id)).forEach(a => {
    const val = s[a.stat] || 0;
    if (val >= a.goal) unlockAchievement(a.id);
  });
  if (gameState.diamonds === 777 && !u.includes('lucky_seven')) unlockAchievement('lucky_seven');
  const h = new Date().getHours();
  if (h >= 0 && h < 4 && !u.includes('night_owl')) unlockAchievement('night_owl');
  if (h >= 5 && h < 7 && !u.includes('early_bird')) unlockAchievement('early_bird');
  if ((s.spectateSessions || 0) >= 30 && !u.includes('the_watcher')) unlockAchievement('the_watcher');
}

// ─── Trophy Road ─────────────────────────────────────────────────────────────

// Category map — keeps existing ACHIEVEMENTS array untouched
const ACH_CATEGORIES = {
  first_blood:'general',  on_fire:'general',    centurion:'general',   grand_master:'general',
  hat_trick:'general',    unstoppable:'general', untouchable:'general',
  survivor:'multiplayer', speed_demon:'multiplayer', buckshot_rookie:'multiplayer', wild_card:'multiplayer',
  wild_master:'multiplayer', buckshot_king:'multiplayer', last_standing:'multiplayer', true_champion:'multiplayer',
  tapper:'speed', tile_hunter:'speed', tile_legend:'speed',
  fashionista:'collection', loaded:'collection', diamond_hands:'collection',
  skin_collector:'collection', the_collector:'collection', diamond_lord:'collection',
  ghost_tap:'special',    konami:'special',  night_owl:'special',  early_bird:'special',
  treasure_hunter:'special', the_watcher:'special', midas_touch:'special',
  back_door:'special',    lucky_seven:'special', phantom:'special',
  whale_1:'special', whale_2:'special', whale_3:'special', whale_4:'special', whale_5:'special',
  whale_6:'special', whale_7:'special', whale_8:'special', whale_song:'special', moby_dick:'special',
  solo_first:'solo', solo_rookie:'solo', solo_warrior:'solo', solo_veteran:'solo', solo_master:'solo',
  solo_explorer:'solo', solo_champion:'solo', solo_legend:'solo',
  solo_void10:'solo', solo_void100:'solo', solo_void500:'solo',
  solo_dbl25:'solo', solo_dbl200:'solo',
  solo_chain10:'solo', solo_chain100:'solo',
  solo_nodmg1:'solo', solo_nodmg25:'solo', solo_nodmg100:'solo',
};

const TROPHY_POINTS_PER_TIER = { bronze:10, silver:25, gold:50, diamond:100, secret:25, whale:150 };

const LEAGUES = [
  { name:'Bronze League',   icon:'🥉', threshold:0    },
  { name:'Silver League',   icon:'🥈', threshold:100  },
  { name:'Gold League',     icon:'🥇', threshold:250  },
  { name:'Platinum League', icon:'🔮', threshold:500  },
  { name:'Diamond League',  icon:'💎', threshold:800  },
  { name:'Master League',   icon:'⚔️', threshold:1200 },
  { name:'Legend League',   icon:'👑', threshold:1500 },
];

const TROPHY_MILESTONES = [
  { pts:  50, reward:{ type:'diamonds', amount: 50  }, label:'50 Diamonds'  },
  { pts: 100, reward:{ type:'tickets',  amount: 1   }, label:'1 Ticket'     },
  { pts: 150, reward:{ type:'diamonds', amount: 75  }, label:'75 Diamonds'  },
  { pts: 200, reward:{ type:'spins',    amount: 1   }, label:'1 Spin'       },
  { pts: 250, reward:{ type:'diamonds', amount: 100 }, label:'100 Diamonds' },
  { pts: 350, reward:{ type:'diamonds', amount: 150 }, label:'150 Diamonds' },
  { pts: 500, reward:{ type:'spins',    amount: 2   }, label:'2 Spins'      },
  { pts: 650, reward:{ type:'diamonds', amount: 200 }, label:'200 Diamonds' },
  { pts: 800, reward:{ type:'tickets',  amount: 2   }, label:'2 Tickets'    },
  { pts:1000, reward:{ type:'spins',    amount: 3   }, label:'3 Spins'      },
  { pts:1200, reward:{ type:'diamonds', amount: 500 }, label:'500 Diamonds' },
  { pts:1500, reward:{ type:'title',    amount: 1   }, label:'Legend Title' },
];

function getTrophyPoints() {
  const unlocked = gameState.unlockedAch || [];
  const ringAch  = gameState.ringAchievements || {};
  let pts = 0;
  ACHIEVEMENTS.forEach(a => { if (unlocked.includes(a.id)) pts += TROPHY_POINTS_PER_TIER[a.tier] || 0; });
  pts += Object.keys(ringAch).length * 10;
  return pts;
}

// Fire-and-forget sync of trophy/achievement summary to server (used by public profiles).
function _syncProgress() {
  try {
    if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
    if (typeof getActiveServer !== 'function') return;
    const pts   = getTrophyPoints();
    const count = (gameState.unlockedAch || []).length;
    const total = ACHIEVEMENTS.length;
    const gems  = gameState.diamonds || 0;
    fetch(`${getActiveServer().http}/playerprogress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: PLAYER_ID,
        trophy_points: pts, achievement_count: count, achievement_total: total, diamonds: gems,
        achievement_ids: gameState.unlockedAch || [],
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
  } catch(e) {}
}

function getCurrentLeague() {
  const pts = getTrophyPoints();
  let league = LEAGUES[0];
  for (const l of LEAGUES) { if (pts >= l.threshold) league = l; else break; }
  return league;
}

async function claimTrophyMilestone(pts) {
  if (!gameState.trophyMilestonesClaimed) gameState.trophyMilestonesClaimed = [];
  if (gameState.trophyMilestonesClaimed.includes(pts)) return;
  const milestone = TROPHY_MILESTONES.find(m => m.pts === pts);
  if (!milestone || getTrophyPoints() < pts) return;

  // Server-side idempotency — block re-claim after localStorage wipe
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
    try {
      const resp = await fetch(`${getActiveServer().http}/trophyroad/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, milestonePts: pts }),
        signal: AbortSignal.timeout(6000),
      });
      const data = resp.ok ? await resp.json() : null;
      if (data && !data.ok && !data.offline && data.error === 'already_claimed') {
        gameState.trophyMilestonesClaimed.push(pts);
        try { saveState(); renderTrophyRoad(); } catch(e) {}
        return;
      }
    } catch(e) { /* offline — allow local claim */ }
  }

  gameState.trophyMilestonesClaimed.push(pts);
  const r = milestone.reward;
  if (r.type === 'diamonds') {
    gameState.diamonds = (gameState.diamonds || 0) + r.amount;
  } else if (r.type === 'tickets') {
    const cap = typeof TICKETS_MAX !== 'undefined' ? TICKETS_MAX : 10;
    const cur = typeof getTickets === 'function' ? getTickets() : (gameState.tickets || 0);
    gameState.tickets = Math.min(cap, cur + r.amount);
  } else if (r.type === 'spins') {
    gameState.freeSpins = (gameState.freeSpins || 0) + r.amount;
  } else if (r.type === 'title') {
    if (!gameState.unlockedTitles) gameState.unlockedTitles = [];
    if (!gameState.unlockedTitles.includes('legend')) gameState.unlockedTitles.push('legend');
  }

  try { saveState(); updateMenuStats(); } catch(e) {}
  const icons = { diamonds:'💎', tickets:'🎟️', spins:'🎡', title:'👑' };
  const lbl = r.type === 'spins' ? `${r.amount} Free Spins`
            : r.type === 'title' ? 'Legend Title Unlocked!'
            : `${icons[r.type]} ${r.amount}`;
  try { showToast(`🏆 ${lbl}!`, 'var(--gold)'); playSound('achieve'); } catch(e) {}
  try { renderTrophyRoad(); } catch(e) {}
  _syncProgress();
}

// Called after each game to update stats
function updateAchStats(result) {
  initAchStats();
  const s = gameState.achStats;
  s.games = (gameState.games || 0);
  s.wins  = (gameState.wins  || 0);
  s.totalTaps = (s.totalTaps || 0) + (result.taps || 0);
  s.totalDiamonds = (s.totalDiamonds || 0) + (result.diamonds || 0);
  if (result.place <= 5) s.top5 = (s.top5 || 0) + 1;
  if (result.place <= 3) s.top3 = (s.top3 || 0) + 1;
  if (result.won) {
    s.winStreak = (s.winStreak || 0) + 1;
    s.bestWinStreak = Math.max(s.winStreak, s.bestWinStreak || 0);
    if (result.mode === 'rush')     s.rushWins     = (s.rushWins || 0) + 1;
    if (result.mode === 'buckshot') s.buckshotWins = (s.buckshotWins || 0) + 1;
    if (result.mode === 'wild')     s.wildWins     = (s.wildWins || 0) + 1;
  } else {
    s.winStreak = 0;
  }
  if (result.mode === 'buckshot') s.buckshotGames = (s.buckshotGames || 0) + 1;
  if (result.mode === 'wild')     s.wildGames     = (s.wildGames || 0) + 1;
  if (result.mode === 'rush')     s.rushGames     = (s.rushGames || 0) + 1;
  s.skinsBought = Object.keys(gameState.ownedSkins || {}).length;
  checkAchievements();
  saveState();
}

