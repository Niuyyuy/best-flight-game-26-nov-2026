// The game's rules and state, with no drawing and no browser in it: the
// courier plane, the ridge course, the glowing rings, the runway, fuel and
// the timer. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react without the world knowing about screens or
// sound. Terrain is a pure function of (x, z), so the renderer and the
// physics always agree about the ground.

import { COURSE, PLANE, RINGS, SCORE, STEP, WIND } from './config.js';
import { fbm2, noise1 } from './random.js';

export const EVENT_RING = 1;
export const EVENT_RING_PERFECT = 2;
export const EVENT_CRASH = 4;
export const EVENT_LANDED = 8;
export const EVENT_FUEL_EMPTY = 16;
export const EVENT_OVER = 32;

/** Where the river runs, in metres of x, as it wanders down the valley. */
export function riverX(z) {
  return 170 * noise1(z * 0.00045 + 3.7) - 60 + 60 * Math.sin(z * 0.00021);
}

/**
 * The crosswind at course distance z, in metres per second sideways
 * (positive pushes the plane to the right). Smooth seeded noise, so the
 * gust a pilot meets at one bend is the same on every run of the seed.
 */
export function windAt(z) {
  return WIND.max * (2 * noise1(z * WIND.wander + WIND.offset) - 1);
}

/** The volcano's centre and height: the ridge the course is named for. */
export const VOLCANO = { x: 210, z: 4300, radius: 950, height: 380 };

/** The coast: beyond this z the ground on the east side gives way to the sea. */
export const COAST_Z = 7900;

/**
 * Ground height, in metres, at lateral position x and course distance z.
 * Rolling hills from fractal noise, a river valley carved along riverX, the
 * volcano cone rising near its centre, flat fields near the runway, and the
 * sea past the coast.
 */
export function terrainHeight(x, z) {
  if (z >= COURSE.runwayStart - 40 && Math.abs(x) < COURSE.runwayHalfWidth + 60) {
    // The runway strip and its shoulders are graded flat.
    const edge = Math.max(0, (Math.abs(x) - COURSE.runwayHalfWidth) / 60);
    return 12 + edge * 6;
  }
  let h = 34 + 58 * fbm2(x * 0.004 + 11, z * 0.0016, 3);
  h += 26 * fbm2(x * 0.013 + 5, z * 0.005, 2);
  // The approach corridor: the ground grades down toward the runway strip
  // over the last stretch, so a plane on the glide slope never meets a hill.
  if (z > 7200) {
    const approach = Math.min(1, (z - 7200) / 1200);
    const corridor = Math.max(0, 1 - Math.abs(x) / 240);
    const blend = approach * corridor;
    h = h * (1 - blend) + 14 * blend;
  }
  // River valley: the ground dips toward the water.
  const riverDistance = Math.abs(x - riverX(z));
  h -= 30 * Math.max(0, 1 - riverDistance / 130);
  // The volcano cone.
  const dx = x - VOLCANO.x;
  const dz = z - VOLCANO.z;
  const cone = Math.max(0, 1 - Math.hypot(dx, dz) / VOLCANO.radius);
  h += VOLCANO.height * cone * cone;
  // The sea: east of the coast the land falls away to the water.
  if (z > COAST_Z) {
    const coast = Math.min(1, (z - COAST_Z) / 420);
    const seaSide = Math.max(0, (x - 40) / 260);
    h = h * (1 - coast * seaSide) + -6 * coast * seaSide;
  }
  return h;
}

/** True when the point is water: the river channel, or the sea past the coast. */
export function isWater(x, z) {
  if (z > COAST_Z && x > 40 + (z - COAST_Z) * 0.12) return true;
  if (Math.abs(x - riverX(z)) < 16 && z < COAST_Z) return true;
  return false;
}

/** Which patch of farmland the point sits in, for the renderer's patchwork. */
export function fieldId(x, z) {
  return Math.floor(x / 150) * 7 + Math.floor(z / 170) * 13;
}

export function createWorld(random) {
  const plane = {
    x: 0,
    altitude: COURSE.startAltitude,
    z: 0,
    speed: COURSE.startSpeed,
    throttle: 0.62,
    pitch: 0, // -1 (full dive) .. 1 (full climb)
    roll: 0, // degrees, -rollMax .. rollMax
    heading: 0, // degrees, 0 = straight down the course
  };
  const rings = RINGS.map((ring) => ({ ...ring, passed: false, scored: false }));
  const state = {
    plane,
    rings,
    score: 0,
    ringsHit: 0,
    /** Rings scored in a row without a miss; a miss breaks it to zero. */
    combo: 0,
    fuel: PLANE.fuel,
    /** The crosswind where the plane is now, metres per second. */
    wind: 0,
    elapsed: 0,
    crashed: false,
    landed: false,
    crashReason: '',
    landingSoft: false,
    best: 0,
  };

  function reset() {
    plane.x = 0;
    plane.altitude = COURSE.startAltitude;
    plane.z = 0;
    plane.speed = COURSE.startSpeed;
    plane.throttle = 0.62;
    plane.pitch = 0;
    plane.roll = 0;
    plane.heading = 0;
    for (const ring of rings) {
      ring.passed = false;
      ring.scored = false;
    }
    state.score = 0;
    state.ringsHit = 0;
    state.combo = 0;
    state.fuel = PLANE.fuel;
    state.wind = 0;
    state.elapsed = 0;
    state.crashed = false;
    state.landed = false;
    state.crashReason = '';
    state.landingSoft = false;
  }

  /**
   * One fixed step. `control` carries pitch (-1..1), roll (-1..1) and throttle
   * change (-1..1) for this step; `harmless` (the title screen's backdrop)
   * flies the plane on rails with nothing able to end the flight.
   */
  function step(dt, control, harmless) {
    let events = 0;
    if (state.crashed || state.landed) return events;
    state.elapsed += dt;

    if (harmless) {
      // A gentle demo flight for the title screen: hold altitude, drift
      // slowly toward the course centre, rings passing by untouched.
      plane.z += plane.speed * dt;
      plane.altitude += (190 - plane.altitude) * 0.4 * dt;
      plane.x += (0 - plane.x) * 0.3 * dt;
      plane.roll = Math.sin(state.elapsed * 0.5) * 8;
      plane.pitch = Math.sin(state.elapsed * 0.35) * 0.08;
      if (plane.z > COURSE.length) {
        plane.z = 0;
        plane.x = 0;
      }
      return events;
    }

    // Throttle and speed.
    plane.throttle = Math.min(1, Math.max(0, plane.throttle + control.throttle * PLANE.throttleRate * dt));
    const targetSpeed = PLANE.speedMin + (PLANE.speedMax - PLANE.speedMin) * plane.throttle;
    plane.speed += (targetSpeed - plane.speed) * Math.min(1, 1.1 * dt);
    if (state.fuel <= 0) plane.speed = Math.max(PLANE.speedMin * 0.7, plane.speed - 12 * dt);

    // Pitch and roll toward the pilot's input. A bank to the right turns
    // the plane to the right: positive roll grows a positive heading.
    plane.pitch += (control.pitch - plane.pitch) * Math.min(1, 6 * dt);
    plane.roll += (control.roll * PLANE.rollMax - plane.roll) * Math.min(1, 5 * dt);
    plane.heading += (plane.roll / PLANE.rollMax) * PLANE.turnRate * dt;
    plane.heading = Math.max(-38, Math.min(38, plane.heading));

    // Move: forward along the course, sideways with the heading, up and down
    // with the pitch. Climb bleeds speed a little; a dive adds some. The
    // crosswind slides the plane sideways on top of all of it, so holding
    // the line means crabbing a few degrees into the gust.
    const headingRad = (plane.heading * Math.PI) / 180;
    plane.z += Math.cos(headingRad) * plane.speed * dt;
    plane.x += Math.sin(headingRad) * plane.speed * dt;
    state.wind = windAt(plane.z);
    plane.x += state.wind * dt;
    const vertical = plane.pitch * (plane.pitch > 0 ? PLANE.climbRate : PLANE.sinkRate);
    plane.altitude += vertical * (plane.speed / 90) * dt;
    plane.altitude = Math.max(2, Math.min(COURSE.maxAltitude, plane.altitude));
    plane.x = Math.max(-COURSE.lateralLimit, Math.min(COURSE.lateralLimit, plane.x));

    // Fuel and the clock.
    const hadFuel = state.fuel > 0;
    state.fuel = Math.max(0, state.fuel - dt * (0.35 + plane.throttle * 0.65));
    if (hadFuel && state.fuel === 0) events |= EVENT_FUEL_EMPTY;
    state.score = Math.max(0, state.score + SCORE.second * dt);

    // Rings: crossing a ring's z scores when the plane is inside it. A hit
    // extends the chain, and the chain pays a bonus on top of the ring;
    // flying past a ring breaks the chain, so the line through the rings
    // matters as much as any single one.
    for (const ring of rings) {
      if (ring.passed || plane.z < ring.z) continue;
      ring.passed = true;
      const dx = plane.x - ring.x;
      const dy = plane.altitude - ring.y;
      const distance = Math.hypot(dx, dy);
      if (distance < ring.r) {
        ring.scored = true;
        state.ringsHit += 1;
        state.combo += 1;
        state.score += SCORE.ring + SCORE.comboStep * (state.combo - 1);
        events |= EVENT_RING;
        if (distance < ring.r * SCORE.perfectFraction) {
          state.score += SCORE.ringPerfect;
          events |= EVENT_RING_PERFECT;
        }
      } else {
        state.combo = 0;
      }
    }

    // The runway: a landing needs to be low, slow, centred and level.
    const ground = terrainHeight(plane.x, plane.z);
    if (plane.z >= COURSE.runwayStart && plane.z <= COURSE.runwayEnd) {
      const overStrip = Math.abs(plane.x) < COURSE.runwayHalfWidth;
      if (overStrip && plane.altitude <= ground + 6 && plane.speed < 105 && Math.abs(plane.roll) < 18) {
        state.landed = true;
        state.landingSoft = plane.speed < 78 && Math.abs(plane.pitch) < 0.25;
        state.score += SCORE.landing + (state.landingSoft ? SCORE.landingSoft : 0);
        events |= EVENT_LANDED | EVENT_OVER;
        return events;
      }
    }
    if (plane.z > COURSE.runwayEnd + 60) {
      state.crashed = true;
      state.crashReason = 'Overshot the runway';
      events |= EVENT_CRASH | EVENT_OVER;
      return events;
    }

    // Terrain and water: the ground is always there to catch a low plane.
    if (plane.altitude <= ground + 2) {
      state.crashed = true;
      state.crashReason = isWater(plane.x, plane.z) ? 'Ditched in the water' : 'Hit the ground';
      events |= EVENT_CRASH | EVENT_OVER;
      return events;
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
