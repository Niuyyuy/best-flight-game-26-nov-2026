// A small seeded random source (mulberry32) plus the smooth value noise the
// terrain is built from. The same seed always gives the same ridge, river and
// fields, which is what makes the screenshot scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 1-D hash: a stable pseudo-random value in [0, 1) for an integer lattice point. */
function hash1(n) {
  let h = Math.imul(n | 0, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A 2-D hash: a stable pseudo-random value in [0, 1) for an integer lattice cell. */
function hash2(x, y) {
  let h = Math.imul((x | 0) + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.imul(y | 0, 0xc2b2ae35), 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smooth 1-D noise along one axis, for the river's wander and the ridge line. */
export function noise1(x) {
  const whole = Math.floor(x);
  const frac = x - whole;
  return lerp(hash1(whole), hash1(whole + 1), smooth(frac));
}

/** Smooth 2-D value noise, for rolling ground and field patches. */
export function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const top = lerp(hash2(xi, yi), hash2(xi + 1, yi), smooth(xf));
  const bottom = lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), smooth(xf));
  return lerp(top, bottom, smooth(yf));
}

/** Fractal noise: several octaves of value noise layered for natural-looking ground. */
export function fbm2(x, y, octaves) {
  let total = 0;
  let weight = 0;
  let amp = 1;
  let freq = 1;
  for (let i = 0; i < octaves; i += 1) {
    total += amp * noise2(x * freq, y * freq);
    weight += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return total / weight;
}

/** A seeded value in [min, max), for one-off placements from a random source. */
export function range(random, min, max) {
  return min + random() * (max - min);
}
