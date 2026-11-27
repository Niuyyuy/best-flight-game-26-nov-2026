// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and game over (a landing counts as game over, with a bonus).
//
// ?seed=N fixes the course's random choices. ?shot=start|play|ring|land
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, SCORE, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_FUEL_EMPTY, EVENT_LANDED, EVENT_OVER, EVENT_RING, EVENT_RING_PERFECT } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      // For local verification: what the staged flight actually reached.
      window.__shotState = {
        screen: scene.screen,
        score: Math.round(world.state.score),
        ringsHit: world.state.ringsHit,
        landed: world.state.landed,
        crashed: world.state.crashed,
        crashReason: world.state.crashReason,
        z: Math.round(world.state.plane.z),
        altitude: Math.round(world.state.plane.altitude),
      };
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each ring.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.engine(world.state.plane.throttle, true);
    announce('Flying. Eight rings, then land on the runway.');
  }

  function endGame(landed) {
    screen = SCREEN_OVER;
    audio.engine(0, false);
    const score = Math.round(world.state.score);
    if (score > best) {
      best = score;
      saveBest(best);
    }
    if (landed) {
      audio.land();
      announce(`Landed! Score ${score}. Best ${best}.`);
    } else {
      audio.crash();
      announce(`${world.state.crashReason}. Score ${score}. Best ${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.engine(0, false);
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      audio.unlock();
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { pitch: 0, roll: 0, throttle: 0 }, true);
      return;
    }
    const events = world.step(STEP, input.control(), false);
    audio.engine(world.state.plane.throttle, screen === SCREEN_PLAY);
    audio.wind(world.state.plane.speed, screen === SCREEN_PLAY);
    if (events & EVENT_RING) {
      const perfect = (events & EVENT_RING_PERFECT) !== 0;
      audio.ring(perfect);
      // The flash names the real haul: the ring, the perfect bonus when
      // the pass was dead centre, and the chain bonus when the rings keep
      // coming without a miss.
      const haul = SCORE.ring + (perfect ? SCORE.ringPerfect : 0) + SCORE.comboStep * (world.state.combo - 1);
      const chain = world.state.combo > 1 ? `  COMBO x${world.state.combo}` : '';
      world.state.flash = perfect ? `PERFECT RING! +${haul}${chain}` : `RING! +${haul}${chain}`;
      world.state.flashUntil = world.state.elapsed + 1.6;
      announce(perfect ? 'Perfect ring.' : 'Ring.');
    }
    if (events & EVENT_FUEL_EMPTY) {
      audio.fuelEmpty();
      announce('Fuel empty.');
    }
    if (events & EVENT_CRASH) endGame(false);
    else if (events & EVENT_LANDED) endGame(true);
    else if (events & EVENT_OVER) endGame(world.state.landed);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.engine(0, false);
      announce('Paused.');
    }
  });

  announce('Merapi Ridge Run. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
