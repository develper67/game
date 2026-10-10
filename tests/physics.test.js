import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, stepBody, rayBox } from '../shared/physics.js';

const ground = { x0: -50, y0: -1, z0: -50, x1: 50, y1: 0, z1: 50 };

test('body falls and lands on the ground', () => {
  const w = new CollisionWorld([ground]);
  const b = { x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, onGround: false };
  for (let i = 0; i < 200; i++) stepBody(w, b, { fx: 0, fz: 0 }, 1 / 60);
  assert.ok(Math.abs(b.y) < 0.01 && b.onGround);
});

test('walls block movement, steps are climbed automatically', () => {
  const wall = { x0: 2, y0: 0, z0: -5, x1: 2.3, y1: 3, z1: 5 };
  const step = { x0: -30, y0: 0, z0: -5, x1: -2, y1: 0.4, z1: 5 };
  const w = new CollisionWorld([ground, wall, step]);
  const b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true };
  for (let i = 0; i < 120; i++) stepBody(w, b, { fx: 1, fz: 0 }, 1 / 60);
  assert.ok(b.x < 2 - 0.3 && b.x > 1.5, `stopped at wall, x=${b.x}`);
  for (let i = 0; i < 180; i++) stepBody(w, b, { fx: -1, fz: 0 }, 1 / 60);
  assert.ok(b.y > 0.39, 'climbed the step');
});

test('jumping reaches about 1.4m and no tunnelling at sprint speed', () => {
  const thin = { x0: 1, y0: 0, z0: -5, x1: 1.1, y1: 3, z1: 5 };
  const w = new CollisionWorld([ground, thin]);
  const b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true };
  let maxY = 0;
  stepBody(w, b, { fx: 0, fz: 0, jump: true }, 1 / 60);
  for (let i = 0; i < 60; i++) { stepBody(w, b, { fx: 0, fz: 0 }, 1 / 60); maxY = Math.max(maxY, b.y); }
  assert.ok(maxY > 1.2 && maxY < 1.6, `jump height ${maxY}`);
  for (let i = 0; i < 60; i++) stepBody(w, b, { fx: 1, fz: 0, sprint: true }, 1 / 20);
  assert.ok(b.x < 1, 'did not pass through the thin wall');
});

test('ray box normals', () => {
  const r = rayBox(0, 1, 0, 1, 0, 0, { x0: 2, y0: 0, z0: -1, x1: 3, y1: 2, z1: 1 }, 100);
  assert.equal(r.t, 2); assert.equal(r.nx, -1);
});
