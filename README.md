# Merapi Ridge Run

[![make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Niuyyuy/best-flight-game-26-nov-2026/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Niuyyuy/best-flight-game-26-nov-2026/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A chase-view flight game for the make.fun bounty
[best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057):
pilot a small courier plane down the Merapi ridge — a seeded river valley,
patchwork farmland, a town, a volcano and a coastline — through eight glowing
rings, then put her down on the runway before the fuel runs out.

## The game

- **Chase view over recognisable terrain.** A pseudo-3D canvas renderer
  draws the ridge in depth slices: rolling hills, the river winding down
  the valley, fields, the volcano with its snow cap and a smoke column
  over the crater, a town by the runway approach, and the sea past the
  coast. The plane stays in frame, banked with the roll, with its
  navigation lights on and its shadow on the ground below.
- **Lit instruments.** An attitude gauge, altimeter and airspeed dial sit
  in a panel along the bottom, with a vertical-speed bar, throttle and
  fuel bars (with seconds left on the tank) and a next-ring readout. The
  HUD shows altitude, speed and heading on a compass tape, plus the
  crosswind, score, rings with the combo multiplier, and the clock.
- **Fly it.** Pitch and bank with the arrow keys or WASD, throttle with
  Shift/Ctrl (or E/Q, or the mouse wheel), steer with the mouse, Space to
  start, P to pause. A crosswind that shifts with the bends pushes the
  plane sideways — crab into it to hold the line. Flying through a ring
  scores 250 (400 for a dead-centre pass), and rings chained without a
  miss pay 50 more each; a landing scores 1,000, plus 400 for a soft one.
  Hit the ground or the water, run out of runway, or run dry and you are
  done. The tank is tight enough that firewalling the throttle the whole
  way risks running dry short of the runway.
- **Sound.** Engine hum, ring chimes, a landing arpeggio and a crash,
  all synthesised live with WebAudio — no audio files.
- **Offline.** Plain static files under `game/`, no libraries, no network
  requests. The course is seeded, so `?seed=N` replays the same flight
  and `?shot=start|play|ring|land&seed=1` stages the screenshot scenes.

## How to run

```sh
node serve.ts
# open http://localhost:8080
```

Node 22 or later, any desktop Chrome. To build the hand-in:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/index.html` — the page; `game/src/` — `config.js` (tuning),
  `random.js` (seeded noise), `world.js` (rules, terrain, physics),
  `render.js` (all drawing), `input.js` (keyboard + mouse),
  `audio.js` (WebAudio sounds), `shots.js` (staged screenshot scenes),
  `main.js` (boot and loop).
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes
  `dossier.json` with the vendored `vendor/makefun-game.ts`.
- `serve.ts` — a tiny static server for local play-testing.
- `screenshots/` — four real renders of this game's own code.
- `shots.json` — the `?shot=` scenes behind the screenshots.

## License

MIT — see [LICENSE](LICENSE).
