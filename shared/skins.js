// Cosmetic weapon skins and crate definitions. Skins only change looks.
import { WEAPON_IDS, WEAPONS } from './items.js';

export const RARITIES = {
  common: { id: 'common', name: 'Common', color: '#b0bec5', order: 0, dupCoins: 30 },
  rare: { id: 'rare', name: 'Rare', color: '#4cc9f0', order: 1, dupCoins: 75 },
  epic: { id: 'epic', name: 'Epic', color: '#c77dff', order: 2, dupCoins: 160 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ffb703', order: 3, dupCoins: 350 },
};
export const RARITY_IDS = Object.keys(RARITIES);

// Visual themes. base/accent/grip are hex colors; pattern drives a procedural texture.
export const THEMES = {
  sandcamo: { name: 'Sand Camo', rarity: 'common', base: 0xc2a878, accent: 0x8a6d46, grip: 0x5b4a33, pattern: 'camo', pc: [0xd8c39a, 0xa88a5c, 0x7a6244] },
  forestcamo: { name: 'Forest Camo', rarity: 'common', base: 0x5b7f3a, accent: 0x3b5226, grip: 0x2b2b2b, pattern: 'camo', pc: [0x6d8f45, 0x3f5a2a, 0x2c3b1f] },
  arctic: { name: 'Arctic', rarity: 'common', base: 0xe8eef2, accent: 0x9fb3c0, grip: 0x55656f, pattern: 'camo', pc: [0xffffff, 0xcfd8dc, 0x90a4ae] },
  bubblegum: { name: 'Bubblegum', rarity: 'common', base: 0xff8fc7, accent: 0xffffff, grip: 0xd94f8f, pattern: 'solid' },
  mint: { name: 'Mint Condition', rarity: 'common', base: 0x8ff0c6, accent: 0xf5fffa, grip: 0x2f8f6a, pattern: 'solid' },
  midnight: { name: 'Midnight', rarity: 'common', base: 0x1f2a48, accent: 0x6c7fd8, grip: 0x101522, pattern: 'solid' },
  tiger: { name: 'Tiger Stripe', rarity: 'rare', base: 0xf28c28, accent: 0x1a1a1a, grip: 0x3a2312, pattern: 'tiger', pc: [0xf28c28, 0x1a1a1a] },
  checker: { name: 'Checkmate', rarity: 'rare', base: 0xf5f5f5, accent: 0x111111, grip: 0x222222, pattern: 'checker', pc: [0xf5f5f5, 0x111111] },
  polka: { name: 'Polka Party', rarity: 'rare', base: 0xffd23f, accent: 0xff4d6d, grip: 0x7b6cff, pattern: 'dots', pc: [0xffd23f, 0xff4d6d] },
  racing: { name: 'Racing Stripes', rarity: 'rare', base: 0x1565c0, accent: 0xffffff, grip: 0x0d1b2a, pattern: 'stripes', pc: [0x1565c0, 0xffffff] },
  cherry: { name: 'Cherry Bomb', rarity: 'rare', base: 0xd00000, accent: 0x111111, grip: 0x370617, pattern: 'stripes', pc: [0xd00000, 0x111111] },
  neon: { name: 'Neon Pulse', rarity: 'epic', base: 0x0b0b16, accent: 0x00f5ff, grip: 0x14142b, pattern: 'circuit', pc: [0x0b0b16, 0x00f5ff], glow: 0x00f5ff },
  lava: { name: 'Lava Flow', rarity: 'epic', base: 0x1b0f0a, accent: 0xff6a00, grip: 0x2b1408, pattern: 'cracks', pc: [0x1b0f0a, 0xff6a00], glow: 0xff5500 },
  toxic: { name: 'Toxic', rarity: 'epic', base: 0x1e2b14, accent: 0x9dff00, grip: 0x101a0a, pattern: 'drips', pc: [0x1e2b14, 0x9dff00], glow: 0x7fff00 },
  galaxy: { name: 'Galaxy', rarity: 'epic', base: 0x2a0a4a, accent: 0xff7ad9, grip: 0x14052a, pattern: 'stars', pc: [0x2a0a4a, 0x5b2a9a, 0xffffff] },
  gold: { name: 'Golden Yoink', rarity: 'legendary', base: 0xffc93c, accent: 0xfff1b5, grip: 0x8a5a00, pattern: 'solid', metal: true, glow: 0x553300 },
  diamond: { name: 'Diamond', rarity: 'legendary', base: 0xbdf4ff, accent: 0xffffff, grip: 0x5fb3c9, pattern: 'facets', pc: [0xe0fbff, 0x8fe3f5, 0xffffff], metal: true, glow: 0x224455 },
  rainbow: { name: 'Rainbow Glitch', rarity: 'legendary', base: 0xff0080, accent: 0xffffff, grip: 0x222222, pattern: 'rainbow', animated: true, glow: 0x331133 },
  dragon: { name: 'Dragon Scale', rarity: 'legendary', base: 0x0f5132, accent: 0xffc93c, grip: 0x3a0d0d, pattern: 'scales', pc: [0x13804e, 0x0a3b24, 0xffc93c], metal: true },
};

// Each weapon gets 2 common, 2 rare, 1 epic and 1 legendary skin.
const ASSIGN = {
  pistol: ['bubblegum', 'sandcamo', 'checker', 'cherry', 'neon', 'gold'],
  revolver: ['midnight', 'arctic', 'tiger', 'polka', 'lava', 'dragon'],
  smg: ['mint', 'forestcamo', 'racing', 'polka', 'toxic', 'rainbow'],
  shotgun: ['sandcamo', 'bubblegum', 'tiger', 'cherry', 'lava', 'gold'],
  rifle: ['forestcamo', 'arctic', 'racing', 'checker', 'galaxy', 'diamond'],
  sniper: ['arctic', 'midnight', 'tiger', 'racing', 'neon', 'dragon'],
  blaster: ['mint', 'bubblegum', 'polka', 'checker', 'galaxy', 'rainbow'],
};

export const SKINS = {};
for (const w of WEAPON_IDS) {
  for (const t of ASSIGN[w]) {
    const th = THEMES[t];
    const id = `${w}_${t}`;
    SKINS[id] = { id, weapon: w, theme: t, name: `${WEAPONS[w].name} | ${th.name}`, short: th.name, rarity: th.rarity };
  }
}
export const SKIN_IDS = Object.keys(SKINS);

export const CRATES = {
  basic: { id: 'basic', name: 'Basic Crate', price: 150, color: '#4cc9f0', odds: { common: 0.70, rare: 0.22, epic: 0.065, legendary: 0.015 }, desc: 'A sturdy box of mostly everyday finishes.' },
  premium: { id: 'premium', name: 'Premium Crate', price: 400, color: '#c77dff', odds: { common: 0.35, rare: 0.38, epic: 0.20, legendary: 0.07 }, desc: 'Better odds for Rare and Epic skins.' },
  legend: { id: 'legend', name: 'Legend Crate', price: 900, color: '#ffb703', odds: { common: 0, rare: 0.40, epic: 0.40, legendary: 0.20 }, desc: 'No commons. A real shot at a Legendary.' },
};
export const CRATE_IDS = Object.keys(CRATES);

export function skinsByRarity(r) { return SKIN_IDS.filter((id) => SKINS[id].rarity === r); }
