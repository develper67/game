// Shared constants used by both the server (Node) and the browser client.
// Keep this file free of Node- or DOM-specific APIs.

export const GAME_NAME = 'yoink!';

export const PHYS = {
  GRAVITY: -24,
  JUMP_SPEED: 8.2,
  WALK_SPEED: 5.4,
  SPRINT_SPEED: 8.4,
  AIR_CONTROL: 0.35,
  GROUND_ACCEL: 60,
  GROUND_FRICTION: 14,
  RADIUS: 0.34,
  HEIGHT: 1.8,
  EYE_HEIGHT: 1.62,
  STEP_HEIGHT: 0.55,
  MAX_FALL_SPEED: 40,
};

export const NET = {
  CLIENT_SEND_HZ: 20,
  SERVER_TICK_HZ: 20,
  INTERP_DELAY_MS: 110,
};

export const MODES = {
  tag: {
    id: 'tag',
    name: 'TAG',
    short: 'Tag',
    color: '#ff4d6d',
    icon: '🏃',
    desc: 'One player is IT. Punch someone to pass it on. Whoever is IT when time runs out loses.',
    minPlayers: 3,
    maxPlayers: 8,
    duration: 150,
  },
  hotpotato: {
    id: 'hotpotato',
    name: 'HOT POTATO',
    short: 'Hot Potato',
    color: '#ff9f1c',
    icon: '🔥',
    desc: 'Pass the ridiculous Boob-tato with E before it pops. Lose all your lives and you are out. Last one standing wins.',
    minPlayers: 3,
    maxPlayers: 8,
    duration: 600,
  },
  grab: {
    id: 'grab',
    name: 'GRAB THE ITEM',
    short: 'Grab the Item',
    color: '#ffd23f',
    icon: '🐔',
    desc: 'Grab the Golden Rubber Chicken and deliver it to the winning table. Punch the carrier to make them drop it.',
    minPlayers: 2,
    maxPlayers: 8,
    duration: 240,
  },
  guns: {
    id: 'guns',
    name: 'HIDDEN GUNS',
    short: 'Hidden Guns',
    color: '#3ddc97',
    icon: '🔫',
    desc: 'Start unarmed. Search buildings and containers for guns and ammo. Last survivor wins.',
    minPlayers: 2,
    maxPlayers: 8,
    duration: 420,
  },
  craft: {
    id: 'craft',
    name: 'SCAVENGE & CRAFT',
    short: 'Scavenge & Craft',
    color: '#4cc9f0',
    icon: '🛠️',
    desc: 'Start with nothing. Scavenge materials, craft weapons, ammo, meds and armor at benches. Last survivor wins.',
    minPlayers: 2,
    maxPlayers: 8,
    duration: 600,
  },
};

export const MODE_IDS = Object.keys(MODES);

export const MATCH = {
  VOTE_SECONDS: 15,
  PRACTICE_VOTE_SECONDS: 10,
  COUNTDOWN_SECONDS: 4,
  RESULTS_SECONDS: 12,
  MAX_PLAYERS: 8,
  MIN_PARTICIPANTS: 4, // bots fill up to this many
  QUEUE_SOLO_WAIT_SECONDS: 25, // a lone player in queue gets bots after this
  REJOIN_GRACE_MS: 45000,
};

export const PARTY = {
  MAX_SIZE: 4,
  INVITE_TTL_MS: 60000,
  DISCONNECT_GRACE_MS: 20000,
};

export const CHAT = {
  MAX_LEN: 200,
  HISTORY: 60,
  RATE_COUNT: 5,
  RATE_WINDOW_MS: 6000,
  MIN_INTERVAL_MS: 400,
};

export const AVATAR_COLORS = [
  '#ff5d73', '#ff9f1c', '#ffd23f', '#3ddc97', '#4cc9f0', '#7b6cff', '#c77dff', '#f1f1f1', '#2b2d42', '#8d5a3b',
];
export const AVATAR_HATS = ['none', 'cap', 'beanie', 'cowboy', 'crown', 'tophat', 'party'];
export const AVATAR_FACES = ['happy', 'cool', 'angry', 'derp', 'wink'];

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

export const HP_MAX = 100;
export const ARMOR_MAX = 100;
