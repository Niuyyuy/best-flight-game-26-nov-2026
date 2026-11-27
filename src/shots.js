// The screenshot scenes behind ?shot=start|play|ring|land. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (bank toward the next ring, hold a safe
// height over the ground, ease off the throttle for the landing), so the
// frame is what a real flight looks like and the same seed always gives the
// same frame.

import { COURSE, STEP } from './config.js';
import { EVENT_OVER, terrainHeight } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 900;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * One step of autopilot: bank toward the next ring (or the runway threshold
 * on final), climb when the ground ahead is high or the ring is above us,
 * and pull the throttle back for the landing. On final the pilot follows a
 * steady glide slope down to the threshold instead of diving at the strip.
 */
function autopilot(state) {
  const plane = state.plane;
  const next = state.rings.find((ring) => !ring.passed);
  const final = plane.z > COURSE.runwayStart - 1500;
  const target = next
    ? { x: next.x, y: next.y, z: next.z }
    : { x: 0, y: 16, z: COURSE.runwayStart + 120 };
  const groundAhead = terrainHeight(plane.x, plane.z + 450);

  let pitch = 0;
  // Climb over high ground ahead — but not over the flat runway corridor,
  // where the glide slope itself keeps the plane just above the strip.
  if (groundAhead > 40 && plane.altitude < groundAhead + 70) pitch = 1;
  else if (final) {
    const glideAlt = 16 + Math.max(0, COURSE.runwayStart + 100 - plane.z) * 0.12;
    pitch = clamp((glideAlt - plane.altitude) / 45, -0.7, 0.7);
  } else {
    // Track the next ring's height proportionally: a deadband would leave
    // the plane a ring's width above or below the target.
    pitch = clamp((target.y - plane.altitude) / 60, -0.6, 0.6);
  }

  const desiredHeading = (Math.atan2(target.x - plane.x, Math.max(60, target.z - plane.z)) * 180) / Math.PI;
  const roll = clamp((desiredHeading - plane.heading) / 18, -1, 1);
  let throttle = 0;
  if (final) throttle = plane.speed > 96 ? -1 : plane.speed < 72 ? 1 : 0;
  else throttle = plane.speed > 118 ? -1 : plane.speed < 88 ? 1 : 0;
  return { pitch, roll, throttle };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. The ring scene stops just short of the fourth ring
 * so it fills the frame; the land scene flies the whole course to touchdown.
 * The score is rounded here: the clock shaves a fraction of a point a
 * second, and a panel should never show a long decimal.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'ring' && name !== 'land') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, { pitch: 0, roll: 0, throttle: 0 }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'ring') {
    const stopZ = 3350;
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      world.step(STEP, autopilot(world.state), false);
      if (world.state.plane.z >= stopZ) break;
    }
    return { screen: SCREEN_PLAY, best: Math.round(world.state.score) };
  }
  const limit = name === 'land' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  for (let index = 0; index < limit / STEP; index += 1) {
    const events = world.step(STEP, autopilot(world.state), false);
    if (events & EVENT_OVER) break;
  }
  const over = world.state.crashed || world.state.landed;
  const screen = over ? SCREEN_OVER : SCREEN_PLAY;
  return { screen, best: Math.round(world.state.score) };
}
