const BOT_NAMES = [
  'FireFox99','TapKing','BlazeMaster','QuickFinger','HotShot',
  'NightTapper','SpeedDemon','FlameRunner','TileHunter','LastStand',
  'BurnOut','GridRipper','TouchKing','FastHands','TileSlayer',
  'AcePlayer','QuickDraw','Inferno','TapGod','SwiftTile',
  'PixelHunter','NeonTapper','GhostFinger','IronFist','TileWolf',
  'CyberTap','StormRider','FlameBolt','ShadowTap','BlitzKing',
  'VoidTapper','ThunderFist','DarkFlame','CrimsonTap','NightBlade',
  'IceBreaker','MegaTapper','UltraFast','HyperTile','SuperNova',
  'AlphaTap','BetaFist','GammaBolt','DeltaFire','EpsilonX',
  'ZetaStrike','EtaTapper','ThetaKing','IotaFlame','KappaGrid'
];

const BOT_AVATARS = [
  '🦊','👾','🤖','🐺','🦁','🐯','🦅','🐉','👻','💀',
  '🔥','⚡','🌪️','🎯','💥','🦂','🐍','🦈','🏴‍☠️','🎭',
  '🧨','🪄','🎪','🎲','🃏','🧿','🪬','🔮','💎','👑',
  '🦄','🐲','🦖','🦕','🐊','🦏','🐃','🦬','🐘','🦛',
  '🧠','👁️','🫀','⚔️','🛡️','🪃','🗡️','🪖','🔱','☠️'
];
// ===== BOT SPEED CONFIG — single source of truth for all bot timing =====
const BOT_CLICK_SPEED_DEFAULT = { min: 2000, max: 3000 };
let BOT_CLICK_SPEED_MS = { ...BOT_CLICK_SPEED_DEFAULT };

