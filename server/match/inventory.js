// Server-side player inventory helpers (weapons, ammo, materials, heals, armor).
import { WEAPONS, AMMO_IDS, MATERIAL_IDS, ARMORS, HEALS } from '../../shared/items.js';
import { ARMOR_MAX } from '../../shared/constants.js';

export function newInventory() {
  return {
    slots: [null, null, null], // weapon items {t, mag}
    held: 0, // 0 = fists/hands, 1..3 = weapon slot
    ammo: Object.fromEntries(AMMO_IDS.map((a) => [a, 0])),
    mats: Object.fromEntries(MATERIAL_IDS.map((m) => [m, 0])),
    heals: { bandage: 0, medkit: 0 },
  };
}

export function heldWeapon(p) {
  if (!p.inv || p.inv.held === 0) return null;
  return p.inv.slots[p.inv.held - 1] || null;
}

// Adds a stack/item to the inventory. Returns leftover item to drop (weapon when full) or null.
export function giveItem(p, it) {
  const inv = p.inv;
  switch (it.kind) {
    case 'weapon': {
      const w = WEAPONS[it.t];
      if (!w) return null;
      const item = { t: it.t, mag: it.mag ?? w.mag };
      const empty = inv.slots.findIndex((s) => !s);
      if (empty !== -1) {
        inv.slots[empty] = item;
        if (inv.held === 0) inv.held = empty + 1;
        return null;
      }
      // replace held slot (or slot 1 when holding hands)
      const idx = inv.held > 0 ? inv.held - 1 : 0;
      const old = inv.slots[idx];
      inv.slots[idx] = item;
      inv.held = idx + 1;
      return old ? { kind: 'weapon', t: old.t, mag: old.mag } : null;
    }
    case 'ammo': inv.ammo[it.t] = (inv.ammo[it.t] || 0) + (it.n || 0); return null;
    case 'mat': inv.mats[it.t] = (inv.mats[it.t] || 0) + (it.n || 1); return null;
    case 'heal': inv.heals[it.t] = (inv.heals[it.t] || 0) + (it.n || 1); return null;
    case 'armor': {
      const a = ARMORS[it.t];
      if (a) p.armor = Math.min(ARMOR_MAX, Math.max(p.armor || 0, 0) + a.armor);
      return null;
    }
    default: return null;
  }
}

// Everything a player drops on elimination
export function dropAll(p) {
  const out = [];
  const inv = p.inv;
  for (const s of inv.slots) if (s) out.push({ kind: 'weapon', t: s.t, mag: s.mag });
  for (const [k, n] of Object.entries(inv.ammo)) if (n > 0) out.push({ kind: 'ammo', t: k, n });
  for (const [k, n] of Object.entries(inv.mats)) if (n > 0) out.push({ kind: 'mat', t: k, n });
  for (const [k, n] of Object.entries(inv.heals)) if (n > 0) out.push({ kind: 'heal', t: k, n });
  return out;
}

export function canAfford(inv, cost) {
  for (const [k, n] of Object.entries(cost)) if ((inv.mats[k] || 0) < n) return false;
  return true;
}

export function pay(inv, cost) {
  for (const [k, n] of Object.entries(cost)) inv.mats[k] -= n;
}

export function serializeInv(p) {
  const inv = p.inv;
  return {
    slots: inv.slots.map((s) => (s ? { t: s.t, mag: s.mag } : null)),
    held: inv.held,
    ammo: { ...inv.ammo },
    mats: { ...inv.mats },
    heals: { ...inv.heals },
    hp: Math.round(p.hp),
    armor: Math.round(p.armor || 0),
  };
}

export function bestHeal(p) {
  const missing = 100 - p.hp;
  if (missing <= 0) return null;
  if (p.inv.heals.medkit > 0 && (missing >= 45 || p.inv.heals.bandage === 0)) return 'medkit';
  if (p.inv.heals.bandage > 0) return 'bandage';
  if (p.inv.heals.medkit > 0) return 'medkit';
  return null;
}

export { HEALS };
