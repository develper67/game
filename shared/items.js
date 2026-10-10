// Weapons, ammo, materials, consumables, recipes and loot tables.

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'Pistol', ammo: 'light', mag: 12, dmg: 22, interval: 0.17, auto: false, reload: 1.3, spread: 0.012, range: 90, pellets: 1, rarity: 0, zoom: 1.25, recoil: 0.03 },
  revolver: { id: 'revolver', name: 'Revolver', ammo: 'heavy', mag: 6, dmg: 46, interval: 0.48, auto: false, reload: 2.0, spread: 0.007, range: 100, pellets: 1, rarity: 1, zoom: 1.3, recoil: 0.07 },
  smg: { id: 'smg', name: 'SMG', ammo: 'light', mag: 30, dmg: 13, interval: 0.075, auto: true, reload: 1.8, spread: 0.034, range: 60, pellets: 1, rarity: 1, zoom: 1.2, recoil: 0.015 },
  shotgun: { id: 'shotgun', name: 'Shotgun', ammo: 'shells', mag: 6, dmg: 11, interval: 0.85, auto: false, reload: 2.4, spread: 0.085, range: 32, pellets: 9, rarity: 1, zoom: 1.15, recoil: 0.09 },
  rifle: { id: 'rifle', name: 'Assault Rifle', ammo: 'rifle', mag: 30, dmg: 20, interval: 0.105, auto: true, reload: 2.0, spread: 0.018, range: 120, pellets: 1, rarity: 2, zoom: 1.45, recoil: 0.02 },
  sniper: { id: 'sniper', name: 'Sniper Rifle', ammo: 'heavy', mag: 5, dmg: 78, interval: 1.15, auto: false, reload: 2.6, spread: 0.002, range: 200, pellets: 1, rarity: 3, zoom: 3.5, recoil: 0.12 },
  blaster: { id: 'blaster', name: 'Yoink Blaster', ammo: 'cells', mag: 20, dmg: 27, interval: 0.16, auto: true, reload: 2.2, spread: 0.006, range: 140, pellets: 1, rarity: 3, zoom: 1.5, recoil: 0.025 },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

export const FISTS = { id: 'fists', name: 'Fists', dmg: 12, range: 2.3, interval: 0.45 };

export const AMMO = {
  light: { id: 'light', name: 'Light Ammo', pickup: 24, color: '#ffd166' },
  shells: { id: 'shells', name: 'Shotgun Shells', pickup: 10, color: '#ef476f' },
  rifle: { id: 'rifle', name: 'Rifle Ammo', pickup: 30, color: '#06d6a0' },
  heavy: { id: 'heavy', name: 'Heavy Ammo', pickup: 10, color: '#118ab2' },
  cells: { id: 'cells', name: 'Energy Cells', pickup: 20, color: '#c77dff' },
};
export const AMMO_IDS = Object.keys(AMMO);

export const MATERIALS = {
  wood: { id: 'wood', name: 'Wood', color: '#b07a45', rarity: 0 },
  scrap: { id: 'scrap', name: 'Scrap Metal', color: '#9aa5b1', rarity: 0 },
  cloth: { id: 'cloth', name: 'Cloth', color: '#f4f1de', rarity: 0 },
  parts: { id: 'parts', name: 'Mechanical Parts', color: '#e09f3e', rarity: 1 },
  gunpowder: { id: 'gunpowder', name: 'Gunpowder', color: '#3d405b', rarity: 1 },
  electronics: { id: 'electronics', name: 'Electronics', color: '#2ec4b6', rarity: 2 },
  rare: { id: 'rare', name: 'Rare Alloy', color: '#c77dff', rarity: 3 },
};
export const MATERIAL_IDS = Object.keys(MATERIALS);

export const HEALS = {
  bandage: { id: 'bandage', name: 'Bandage', heal: 25, time: 2.0, max: 100 },
  medkit: { id: 'medkit', name: 'Medkit', heal: 65, time: 3.5, max: 100 },
};

export const ARMORS = {
  vest: { id: 'vest', name: 'Scrap Vest', armor: 50 },
  plate: { id: 'plate', name: 'Plated Armor', armor: 100 },
};

export const ARMOR_ABSORB = 0.66; // share of incoming damage absorbed by armor

export const RECIPES = [
  { id: 'pistol', cat: 'weapon', name: 'Pistol', out: { weapon: 'pistol' }, cost: { wood: 2, scrap: 3, parts: 1 } },
  { id: 'shotgun', cat: 'weapon', name: 'Shotgun', out: { weapon: 'shotgun' }, cost: { wood: 4, scrap: 5, parts: 2 } },
  { id: 'revolver', cat: 'weapon', name: 'Revolver', out: { weapon: 'revolver' }, cost: { wood: 2, scrap: 4, parts: 2, gunpowder: 1 } },
  { id: 'smg', cat: 'weapon', name: 'SMG', out: { weapon: 'smg' }, cost: { scrap: 6, parts: 3, electronics: 1 } },
  { id: 'rifle', cat: 'weapon', name: 'Assault Rifle', out: { weapon: 'rifle' }, cost: { scrap: 7, parts: 3, electronics: 2, rare: 1 } },
  { id: 'sniper', cat: 'weapon', name: 'Sniper Rifle', out: { weapon: 'sniper' }, cost: { wood: 2, scrap: 6, parts: 3, electronics: 2, rare: 2 } },
  { id: 'blaster', cat: 'weapon', name: 'Yoink Blaster', out: { weapon: 'blaster' }, cost: { scrap: 5, electronics: 4, rare: 3 } },
  { id: 'ammo_light', cat: 'ammo', name: 'Light Ammo x15', out: { ammo: 'light', n: 15 }, cost: { gunpowder: 1, scrap: 1 } },
  { id: 'ammo_shells', cat: 'ammo', name: 'Shells x6', out: { ammo: 'shells', n: 6 }, cost: { gunpowder: 1, scrap: 1 } },
  { id: 'ammo_rifle', cat: 'ammo', name: 'Rifle Ammo x20', out: { ammo: 'rifle', n: 20 }, cost: { gunpowder: 2, scrap: 1 } },
  { id: 'ammo_heavy', cat: 'ammo', name: 'Heavy Ammo x6', out: { ammo: 'heavy', n: 6 }, cost: { gunpowder: 2, scrap: 1 } },
  { id: 'ammo_cells', cat: 'ammo', name: 'Energy Cells x15', out: { ammo: 'cells', n: 15 }, cost: { electronics: 1, rare: 1 } },
  { id: 'bandage', cat: 'heal', name: 'Bandages x2', out: { heal: 'bandage', n: 2 }, cost: { cloth: 2 } },
  { id: 'medkit', cat: 'heal', name: 'Medkit', out: { heal: 'medkit', n: 1 }, cost: { cloth: 3, scrap: 1 } },
  { id: 'vest', cat: 'armor', name: 'Scrap Vest (+50 armor)', out: { armor: 'vest' }, cost: { cloth: 2, scrap: 4 } },
  { id: 'plate', cat: 'armor', name: 'Plated Armor (+100 armor)', out: { armor: 'plate' }, cost: { cloth: 2, scrap: 4, parts: 2, rare: 1 } },
];
export const RECIPE_MAP = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// Loot tables: arrays of [weight, item]. Items: {kind, t, n}
export const GUN_LOOT = {
  0: [[24, { kind: 'weapon', t: 'pistol' }], [34, { kind: 'ammo', t: 'light' }], [10, { kind: 'ammo', t: 'shells' }], [18, { kind: 'heal', t: 'bandage', n: 2 }], [9, { kind: 'weapon', t: 'smg' }], [5, { kind: 'weapon', t: 'shotgun' }]],
  1: [[12, { kind: 'weapon', t: 'pistol' }], [16, { kind: 'weapon', t: 'smg' }], [16, { kind: 'weapon', t: 'shotgun' }], [9, { kind: 'weapon', t: 'revolver' }], [6, { kind: 'weapon', t: 'rifle' }],
    [10, { kind: 'ammo', t: 'light' }], [8, { kind: 'ammo', t: 'shells' }], [6, { kind: 'ammo', t: 'rifle' }], [5, { kind: 'ammo', t: 'heavy' }], [6, { kind: 'heal', t: 'medkit', n: 1 }], [8, { kind: 'armor', t: 'vest' }]],
  2: [[22, { kind: 'weapon', t: 'rifle' }], [11, { kind: 'weapon', t: 'sniper' }], [10, { kind: 'weapon', t: 'shotgun' }], [4, { kind: 'weapon', t: 'blaster' }], [10, { kind: 'ammo', t: 'rifle' }],
    [7, { kind: 'ammo', t: 'heavy' }], [3, { kind: 'ammo', t: 'cells' }], [10, { kind: 'heal', t: 'medkit', n: 1 }], [9, { kind: 'armor', t: 'plate' }], [7, { kind: 'armor', t: 'vest' }]],
};

export const CRAFT_LOOT = {
  0: [[26, { kind: 'mat', t: 'wood', n: 3 }], [26, { kind: 'mat', t: 'scrap', n: 3 }], [18, { kind: 'mat', t: 'cloth', n: 2 }], [10, { kind: 'mat', t: 'parts', n: 1 }], [10, { kind: 'mat', t: 'gunpowder', n: 1 }], [5, { kind: 'mat', t: 'electronics', n: 1 }]],
  1: [[14, { kind: 'mat', t: 'scrap', n: 4 }], [18, { kind: 'mat', t: 'parts', n: 2 }], [16, { kind: 'mat', t: 'gunpowder', n: 2 }], [12, { kind: 'mat', t: 'electronics', n: 1 }], [10, { kind: 'mat', t: 'cloth', n: 3 }], [8, { kind: 'mat', t: 'wood', n: 4 }], [3, { kind: 'mat', t: 'rare', n: 1 }]],
  2: [[16, { kind: 'mat', t: 'electronics', n: 2 }], [16, { kind: 'mat', t: 'rare', n: 1 }], [16, { kind: 'mat', t: 'gunpowder', n: 3 }], [14, { kind: 'mat', t: 'parts', n: 3 }], [8, { kind: 'mat', t: 'scrap', n: 5 }], [6, { kind: 'heal', t: 'bandage', n: 1 }]],
};

export const RESOURCE_NODES = {
  wood: { name: 'Wood Pile', gives: [['wood', 3]], bonus: [['cloth', 1, 0.15]], uses: 4, time: 1.4 },
  scrap: { name: 'Scrap Heap', gives: [['scrap', 3]], bonus: [['parts', 1, 0.35], ['gunpowder', 1, 0.15]], uses: 4, time: 1.6 },
  parts: { name: 'Machine Parts', gives: [['parts', 2]], bonus: [['electronics', 1, 0.4], ['gunpowder', 1, 0.3]], uses: 3, time: 1.8 },
};

export const CONTAINER_SEARCH_TIME = 1.1;

export function rollTable(table, rng = Math.random) {
  let total = 0;
  for (const [w] of table) total += w;
  let r = rng() * total;
  for (const [w, item] of table) {
    r -= w;
    if (r <= 0) return { ...item };
  }
  return { ...table[table.length - 1][1] };
}

export function itemLabel(it) {
  if (!it) return '';
  switch (it.kind) {
    case 'weapon': return WEAPONS[it.t]?.name || it.t;
    case 'ammo': return `${AMMO[it.t]?.name || it.t} x${it.n || AMMO[it.t]?.pickup || 0}`;
    case 'mat': return `${MATERIALS[it.t]?.name || it.t} x${it.n || 1}`;
    case 'heal': return `${HEALS[it.t]?.name || it.t}${(it.n || 1) > 1 ? ' x' + it.n : ''}`;
    case 'armor': return ARMORS[it.t]?.name || it.t;
    case 'chicken': return 'Golden Rubber Chicken';
    default: return it.t;
  }
}
