// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred. The
// terrain is drawn in depth slices, far to near, each slice a cross-section
// of the ground projected with a pinhole camera; the rings, the runway, the
// plane and the lit instruments are painted over it. Flat canvas shapes and
// canvas text only — no images, no network.

import { COURSE, FIELD, FOCAL, FONT, PALETTE, PLANE, VIEW_DISTANCE } from './config.js';
import { fieldId, isWater, terrainHeight, VOLCANO, windAt } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const CX = FIELD.width / 2;
const HORIZON_BASE = 296;
const PLANE_SCREEN_Y = 512;
const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };
const CLOUDS = [];
for (let i = 0; i < 26; i += 1) {
  CLOUDS.push({
    x: ((i * 733) % 1400) - 700,
    y: 380 + ((i * 97) % 160),
    z: ((i * 1157) % 9000) + 300,
    size: 60 + ((i * 53) % 90),
  });
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

/** A stable shade for a field patch, picked from its id. */
function fieldColour(id) {
  const pick = ((id % 5) + 5) % 5;
  if (pick === 0) return PALETTE.fieldA;
  if (pick === 1) return PALETTE.fieldB;
  if (pick === 2) return PALETTE.fieldC;
  if (pick === 3) return PALETTE.forest;
  return PALETTE.fieldA;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const headingLabel = cachedLabel('HDG ');
  const scoreLabel = cachedLabel('SCORE ');
  const ringsLabel = cachedLabel('RINGS ');
  const timeLabel = cachedLabel('TIME ');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    // The baseline is set by the caller: 'top' for the HUD, 'alphabetic'
    // for panels and gauge labels, so nothing here overrides it.
    context.fillText(value, x, y);
  }

  /** Project a world point to logical screen coordinates; null when behind. */
  function project(x, h, z, plane) {
    const dz = z - plane.z;
    if (dz < 6) return null;
    const headingRad = (plane.heading * Math.PI) / 180;
    const lateral = (x - plane.x) - dz * headingRad;
    const scale = FOCAL / dz;
    const horizonY = HORIZON_BASE + plane.pitch * 170;
    return {
      x: CX + lateral * scale,
      y: horizonY + (plane.altitude - h) * scale * 0.92,
      scale,
      horizonY,
    };
  }

  function drawSky(state) {
    const plane = state.plane;
    const horizonY = HORIZON_BASE + plane.pitch * 170;
    const gradient = context.createLinearGradient(0, 0, 0, horizonY + 40);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.62, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyHorizon);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, horizonY + 40);
    // The sun, high and to the left, clear of the HUD readouts.
    const sunX = CX - 540;
    const sunY = 152 - plane.pitch * 40;
    context.fillStyle = PALETTE.sun;
    context.beginPath();
    context.arc(sunX, sunY, 26, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255, 243, 196, 0.35)';
    context.beginPath();
    context.arc(sunX, sunY, 40, 0, Math.PI * 2);
    context.fill();
    // Two far ridge lines above the horizon, sliding sideways with the
    // heading so the world feels deep instead of flat. The nearer line is
    // darker and lower; both are drawn as sine ridges, never as straight
    // bands, so the horizon reads as mountains, not a wall.
    for (const layer of [
      { lift: 34, amp: 16, colour: PALETTE.ridgeSilhouette, drift: 1.6, phase: 2.1 },
      { lift: 16, amp: 11, colour: PALETTE.ridgeMid, drift: 0.9, phase: 5.4 },
    ]) {
      context.fillStyle = layer.colour;
      context.beginPath();
      context.moveTo(0, horizonY + 2);
      for (let x = 0; x <= FIELD.width; x += 32) {
        const wave = Math.sin(x * 0.006 + layer.phase + plane.heading * 0.02 * layer.drift)
          + 0.5 * Math.sin(x * 0.013 + layer.phase * 2.7);
        context.lineTo(x, horizonY - layer.lift - wave * layer.amp);
      }
      context.lineTo(FIELD.width, horizonY + 2);
      context.closePath();
      context.fill();
    }
    // The volcano's smoke: a column of puffs rising off the crater and
    // leaning downwind, so the ridge's namesake is visible long before the
    // cone itself fills the frame. Each puff grows and fades as it climbs.
    drawSmoke(state);
    // Clouds drift with the course: each one is a fixed world point. Near
    // ones are skipped, so a cloud the plane is about to fly through never
    // fills the frame, and the size is capped for the same reason.
    context.fillStyle = 'rgba(255,255,255,0.85)';
    for (const cloud of CLOUDS) {
      const dz = cloud.z - plane.z;
      if (dz < 320) continue;
      const p = project(cloud.x, cloud.y, cloud.z, plane);
      if (!p || p.y > horizonY + 10) continue;
      const r = Math.min(90, Math.max(6, cloud.size * p.scale * 0.9));
      context.beginPath();
      context.ellipse(p.x, p.y, r, r * 0.42, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  /**
   * The smoke column over the volcano: nine puffs rising off the crater,
   * each one further up, further downwind and fainter than the last, so
   * the plume reads as a rising column even in a still frame. Skipped
   * entirely once the volcano is behind the plane or out of view.
   */
  function drawSmoke(state) {
    const plane = state.plane;
    const dz = VOLCANO.z - plane.z;
    if (dz < 60 || dz > VIEW_DISTANCE) return;
    const top = terrainHeight(VOLCANO.x, VOLCANO.z);
    const drift = windAt(VOLCANO.z) * 6;
    const sway = Math.sin(state.elapsed * 0.4) * 6;
    for (let i = 0; i < 9; i += 1) {
      const puffX = VOLCANO.x + drift * i * 0.14 + sway * (i / 9);
      const puffY = top + 26 + i * 26;
      const puffZ = VOLCANO.z - i * 14;
      const p = project(puffX, puffY, puffZ, plane);
      if (!p) continue;
      const r = Math.max(3, (7 + i * 5) * p.scale);
      context.fillStyle = PALETTE.smoke;
      context.globalAlpha = Math.max(0.12, 0.62 - i * 0.055);
      context.beginPath();
      context.arc(p.x, p.y, r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  /** What a strip of ground looks like, from what is under its middle. */
  function groundColour(x, z, dz) {
    const h = terrainHeight(x, z);
    const cone = Math.max(0, 1 - Math.hypot(x - VOLCANO.x, z - VOLCANO.z) / VOLCANO.radius);
    if (isWater(x, z)) return PALETTE.river;
    if (cone > 0.55) return h > 300 ? PALETTE.volcanoSnow : PALETTE.volcanoRock;
    if (cone > 0.25) return PALETTE.ridgeNear;
    if (h < 25) return PALETTE.fieldC;
    if (dz > 1900) return PALETTE.ridgeFar;
    return fieldColour(fieldId(x, z));
  }

  /**
   * The ground, drawn as strips between depth slices, far to near. Each
   * strip is the surface between two cross-sections of the terrain, so the
   * ground reads as rolling land instead of a fence of vertical bars; the
   * nearest strip runs down to the bottom of the screen. A hazy band is
   * painted below the horizon first, so no gap of backdrop shows between
   * the horizon and the farthest slice.
   */
  function drawTerrain(state) {
    const plane = state.plane;
    const horizonY = HORIZON_BASE + plane.pitch * 170;
    context.fillStyle = PALETTE.ridgeFar;
    context.fillRect(0, horizonY, FIELD.width, FIELD.height - horizonY);
    const slices = [];
    let dz = 26;
    while (dz <= VIEW_DISTANCE) {
      const z = plane.z + dz;
      const points = [];
      for (let x = -720; x <= 720; x += 46) {
        const p = project(x, terrainHeight(x, z), z, plane);
        if (p) points.push({ p, x });
      }
      if (points.length > 1) slices.push({ z, dz, points });
      dz *= 1.17;
    }
    for (let s = slices.length - 1; s >= 0; s -= 1) {
      const near = slices[s];
      const far = slices[s + 1];
      for (let i = 0; i < near.points.length - 1; i += 1) {
        const a = near.points[i];
        const b = near.points[i + 1];
        const midX = (a.x + b.x) / 2;
        context.fillStyle = groundColour(midX, near.z, near.dz);
        context.beginPath();
        context.moveTo(a.p.x, a.p.y);
        context.lineTo(b.p.x, b.p.y);
        if (far && i < far.points.length - 1) {
          // The strip's far edge: the same ground one slice further out.
          context.lineTo(far.points[i + 1].p.x, far.points[i + 1].p.y);
          context.lineTo(far.points[i].p.x, far.points[i].p.y);
        } else {
          // The nearest strip: down to the bottom of the screen.
          context.lineTo(b.p.x, FIELD.height);
          context.lineTo(a.p.x, FIELD.height);
        }
        context.closePath();
        context.fill();
      }
    }
  }

  /**
   * Two settlements the floor entry only named: a town of twenty-six
   * houses beside the runway approach, and a hamlet of fourteen further
   * up the valley. Positions come from a fixed scramble of the index, so
   * the towns never move between runs; each house is a wall block with a
   * pitched roof, drawn only while it is big enough to see.
   */
  const TOWNS = [];
  for (let i = 0; i < 26; i += 1) {
    TOWNS.push({ x: 150 + ((i * 137) % 230), z: 8120 + ((i * 211) % 520), w: 14 + ((i * 53) % 16) });
  }
  for (let i = 0; i < 14; i += 1) {
    TOWNS.push({ x: 250 + ((i * 173) % 150), z: 5020 + ((i * 149) % 420), w: 12 + ((i * 41) % 12) });
  }

  function drawTown(state) {
    const plane = state.plane;
    for (const house of TOWNS) {
      const dz = house.z - plane.z;
      if (dz < 30 || dz > VIEW_DISTANCE) continue;
      const ground = terrainHeight(house.x, house.z);
      const base = project(house.x, ground, house.z, plane);
      if (!base || base.scale < 0.02) continue;
      const top = project(house.x, ground + house.w * 0.6, house.z, plane);
      if (!top) continue;
      const half = (house.w * base.scale) / 2;
      if (half < 1.5) continue;
      context.fillStyle = PALETTE.townWall;
      context.fillRect(base.x - half, top.y, half * 2, base.y - top.y);
      context.fillStyle = PALETTE.townRoof;
      context.beginPath();
      context.moveTo(base.x - half - 2, top.y);
      context.lineTo(base.x, top.y - Math.max(2, half * 0.7));
      context.lineTo(base.x + half + 2, top.y);
      context.closePath();
      context.fill();
    }
  }

  function drawRunway(state) {
    const plane = state.plane;
    if (plane.z > COURSE.runwayEnd || COURSE.runwayStart - plane.z > VIEW_DISTANCE) return;
    const hw = COURSE.runwayHalfWidth;
    let prev = null;
    for (let z = Math.max(COURSE.runwayStart, plane.z + 12); z <= COURSE.runwayEnd; z += 70) {
      const left = project(-hw, 12, z, plane);
      const right = project(hw, 12, z, plane);
      if (!left || !right) continue;
      if (prev) {
        context.fillStyle = PALETTE.runway;
        context.beginPath();
        context.moveTo(prev.left.x, prev.left.y);
        context.lineTo(prev.right.x, prev.right.y);
        context.lineTo(right.x, right.y);
        context.lineTo(left.x, left.y);
        context.closePath();
        context.fill();
      }
      // Centreline dashes, every other strip.
      if (Math.floor(z / 140) % 2 === 0) {
        const c1 = project(-3, 13, z, plane);
        const c2 = project(3, 13, z, plane);
        const c3 = project(3, 13, Math.min(z + 60, COURSE.runwayEnd), plane);
        const c4 = project(-3, 13, Math.min(z + 60, COURSE.runwayEnd), plane);
        if (c1 && c2 && c3 && c4) {
          context.fillStyle = PALETTE.runwayMark;
          context.beginPath();
          context.moveTo(c1.x, c1.y);
          context.lineTo(c2.x, c2.y);
          context.lineTo(c3.x, c3.y);
          context.lineTo(c4.x, c4.y);
          context.closePath();
          context.fill();
        }
      }
      prev = { left, right };
    }
    // The threshold: a white bar across the strip's near end.
    const t1 = project(-hw, 13, COURSE.runwayStart, plane);
    const t2 = project(hw, 13, COURSE.runwayStart, plane);
    const t3 = project(hw, 13, COURSE.runwayStart + 26, plane);
    const t4 = project(-hw, 13, COURSE.runwayStart + 26, plane);
    if (t1 && t2 && t3 && t4) {
      context.fillStyle = PALETTE.runwayMark;
      context.beginPath();
      context.moveTo(t1.x, t1.y);
      context.lineTo(t2.x, t2.y);
      context.lineTo(t3.x, t3.y);
      context.lineTo(t4.x, t4.y);
      context.closePath();
      context.fill();
    }
    // Edge lights down both sides, pale on the far half and amber near,
    // so the strip reads as a runway from a kilometre out, not a grey bar.
    for (let z = COURSE.runwayStart; z <= COURSE.runwayEnd; z += 140) {
      for (const side of [-hw, hw]) {
        const light = project(side, 14, z, plane);
        if (!light || light.scale < 0.12) continue;
        context.fillStyle = z > (COURSE.runwayStart + COURSE.runwayEnd) / 2 ? PALETTE.runwayLight : PALETTE.runwayLightEdge;
        context.beginPath();
        context.arc(light.x, light.y, Math.max(1.5, 2.4 * light.scale), 0, Math.PI * 2);
        context.fill();
      }
    }
    // Approach lights: three rows of white bars on the grass before the
    // threshold, the last thing a pilot lines up on before touching down.
    for (let z = COURSE.runwayStart - 260; z < COURSE.runwayStart; z += 70) {
      const a = project(-12, 13, z, plane);
      const b = project(12, 13, z, plane);
      if (!a || !b) continue;
      context.fillStyle = PALETTE.runwayLight;
      context.fillRect(a.x, a.y - 1, Math.max(1, b.x - a.x), 2);
    }
    // The runway's number, painted big across the threshold: the course
    // flies due north, so the strip is 36. Drawn as screen text at the
    // projected threshold, sized by distance and never smaller than a
    // readable label.
    const number = project(0, 14, COURSE.runwayStart + 130, plane);
    if (number && number.scale > 0.25) {
      context.textBaseline = 'alphabetic';
      text('36', number.x, number.y, Math.max(16, Math.min(64, 46 * number.scale)), PALETTE.runwayMark, 'center');
    }
  }

  function drawRings(state) {
    const plane = state.plane;
    // Far rings first so near ones paint over them.
    const sorted = [...state.rings].sort((a, b) => b.z - a.z);
    for (const ring of sorted) {
      const dz = ring.z - plane.z;
      if (dz < 4 || dz > VIEW_DISTANCE) continue;
      const p = project(ring.x, ring.y, ring.z, plane);
      if (!p) continue;
      const rx = ring.r * p.scale;
      const ry = rx * 0.94;
      if (rx < 2) continue;
      const colour = ring.scored ? PALETTE.ringDone : PALETTE.ring;
      context.strokeStyle = PALETTE.ringGlow;
      context.lineWidth = Math.max(2, rx * 0.22);
      context.globalAlpha = 0.45;
      context.beginPath();
      context.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
      context.strokeStyle = colour;
      context.lineWidth = Math.max(2, rx * 0.09);
      context.beginPath();
      context.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      context.stroke();
      // Chevrons on the ring face, so a ring reads as a target even small.
      context.fillStyle = colour;
      for (let i = 0; i < 4; i += 1) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const dotX = p.x + Math.cos(angle) * rx * 0.86;
        const dotY = p.y + Math.sin(angle) * ry * 0.86;
        context.beginPath();
        context.arc(dotX, dotY, Math.max(2, rx * 0.07), 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  /** The courier plane from behind, banked with the roll, propeller a blur. */
  function drawPlane(state) {
    const plane = state.plane;
    // The plane's shadow on the ground ahead and below: a dark ellipse
    // that grows sharper and darker as the plane sinks, the one cue that
    // says how high the plane really is over the ridge.
    if (!state.landed) {
      const ground = terrainHeight(plane.x, plane.z + 60);
      const shadow = project(plane.x, ground, plane.z + 60, plane);
      if (shadow) {
        const heightAbove = Math.max(0, plane.altitude - ground);
        context.globalAlpha = Math.max(0.05, 0.30 - heightAbove / 1400);
        context.fillStyle = PALETTE.shadow;
        context.beginPath();
        context.ellipse(shadow.x, shadow.y, Math.max(6, 70 * shadow.scale), Math.max(2, 12 * shadow.scale), 0, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
    }
    const bob = Math.sin(state.elapsed * 2.1) * 2;
    const x = CX + plane.roll * 1.1;
    const y = PLANE_SCREEN_Y - plane.pitch * 46 + bob;
    context.save();
    context.translate(x, y);
    context.rotate((plane.roll * Math.PI) / 180);
    // Propeller blur: a faint disc ahead of the nose, kept small so it
    // reads as motion rather than a separate object.
    context.fillStyle = 'rgba(246,241,230,0.16)';
    context.beginPath();
    context.ellipse(0, -56, 15, 22, 0, 0, Math.PI * 2);
    context.fill();
    // Wings, with red tips.
    context.fillStyle = PALETTE.planeWing;
    context.beginPath();
    context.roundRect(-128, -14, 256, 26, 10);
    context.fill();
    context.fillStyle = PALETTE.planeBody;
    context.fillRect(-128, -14, 22, 26);
    context.fillRect(106, -14, 22, 26);
    // Fuselage: wide at the tail, narrowing toward the nose.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(-26, 42);
    context.lineTo(-20, -52);
    context.quadraticCurveTo(0, -64, 20, -52);
    context.lineTo(26, 42);
    context.quadraticCurveTo(0, 52, -26, 42);
    context.closePath();
    context.fill();
    // A pale cheatline down the fuselage, so the body reads as built
    // rather than a flat red shape.
    context.fillStyle = PALETTE.planeWing;
    context.fillRect(-3, -50, 6, 88);
    // Cabin stripe and lit windows.
    context.fillStyle = PALETTE.planeTrim;
    context.fillRect(-20, -38, 40, 7);
    context.fillStyle = PALETTE.gaugeLit;
    context.beginPath();
    context.arc(-9, -24, 4, 0, Math.PI * 2);
    context.arc(9, -24, 4, 0, Math.PI * 2);
    context.fill();
    // Tail fin and stabiliser.
    context.fillStyle = PALETTE.planeTrim;
    context.beginPath();
    context.moveTo(-4, 40);
    context.lineTo(-4, 66);
    context.lineTo(4, 66);
    context.lineTo(4, 40);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.planeWing;
    context.beginPath();
    context.roundRect(-52, 30, 104, 12, 6);
    context.fill();
    // Navigation lights: red port, green starboard, white strobe.
    context.fillStyle = '#ff4d4d';
    context.beginPath();
    context.arc(-128, -1, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#4dff88';
    context.beginPath();
    context.arc(128, -1, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = Math.floor(state.elapsed * 2) % 2 === 0 ? '#ffffff' : 'rgba(255,255,255,0.25)';
    context.beginPath();
    context.arc(0, 48, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawGauge(cx, cy, radius, label) {
    context.textBaseline = 'alphabetic';
    context.fillStyle = PALETTE.panelEdge;
    context.beginPath();
    context.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.gaugeFace;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(159,232,255,0.35)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    text(label, cx, cy + radius + 14, 11, PALETTE.hudDim, 'center');
  }

  /** The lit instrument panel along the bottom of the screen. */
  function drawInstruments(state) {
    const plane = state.plane;
    const top = FIELD.height - 92;
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, top, FIELD.width, 92);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, top, FIELD.width, 2);
    // Artificial horizon: sky and ground split by the roll, shifted by pitch.
    const hx = 150;
    const hy = top + 40;
    drawGauge(hx, hy, 24, 'ATTITUDE');
    context.save();
    context.beginPath();
    context.arc(hx, hy, 24, 0, Math.PI * 2);
    context.clip();
    context.translate(hx, hy);
    context.rotate((-plane.roll * Math.PI) / 180);
    context.translate(0, plane.pitch * 18);
    context.fillStyle = '#3f8fd2';
    context.fillRect(-26, -26, 52, 26);
    context.fillStyle = '#7a5a34';
    context.fillRect(-26, 0, 52, 26);
    context.fillStyle = '#ffffff';
    context.fillRect(-26, -1, 52, 2);
    context.restore();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(hx - 12, hy);
    context.lineTo(hx - 4, hy);
    context.moveTo(hx + 4, hy);
    context.lineTo(hx + 12, hy);
    context.stroke();
    // Altimeter: a needle round a dial, 0..600 m.
    const ax = 330;
    const ay = top + 40;
    drawGauge(ax, ay, 24, 'ALTITUDE');
    const altAngle = -Math.PI * 0.75 + (Math.min(600, plane.altitude) / 600) * Math.PI * 1.5;
    context.strokeStyle = PALETTE.gaugeLit;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(ax, ay);
    context.lineTo(ax + Math.cos(altAngle) * 19, ay + Math.sin(altAngle) * 19);
    context.stroke();
    // Airspeed: needle round a dial, 0..160 m/s.
    const sx = 510;
    const sy = top + 40;
    drawGauge(sx, sy, 24, 'AIRSPEED');
    const spdAngle = -Math.PI * 0.75 + (Math.min(160, plane.speed) / 160) * Math.PI * 1.5;
    context.strokeStyle = PALETTE.gaugeAmber;
    context.beginPath();
    context.moveTo(sx, sy);
    context.lineTo(sx + Math.cos(spdAngle) * 19, sy + Math.sin(spdAngle) * 19);
    context.stroke();
    // Vertical speed: a bar that grows up from the middle when climbing
    // and down when sinking, so the pilot sees the climb rate at a glance
    // instead of watching the altimeter needle crawl.
    const vs = plane.pitch * (plane.pitch > 0 ? PLANE.climbRate : PLANE.sinkRate) * (plane.speed / 90);
    const vx = 584;
    const vy = top + 40;
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(vx - 5, vy - 24, 10, 48);
    const vsHeight = Math.max(0, Math.min(24, (Math.abs(vs) / 30) * 24));
    context.fillStyle = vs >= 0 ? PALETTE.gaugeLit : PALETTE.gaugeAmber;
    if (vs >= 0) context.fillRect(vx - 5, vy - vsHeight, 10, vsHeight);
    else context.fillRect(vx - 5, vy, 10, vsHeight);
    context.textBaseline = 'alphabetic';
    text('V/S', vx, vy + 38, 11, PALETTE.hudDim, 'center');
    // Throttle and fuel, as bars on the right of the panel.
    text('THROTTLE', 640, top + 26, 13, PALETTE.hudDim, 'left');
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(640, top + 34, 220, 12);
    context.fillStyle = PALETTE.gaugeAmber;
    context.fillRect(640, top + 34, 220 * plane.throttle, 12);
    text('FUEL', 640, top + 66, 13, PALETTE.hudDim, 'left');
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(640, top + 74, 220, 12);
    context.fillStyle = state.fuel < 30 ? PALETTE.danger : PALETTE.ok;
    context.fillRect(640, top + 74, 220 * Math.max(0, state.fuel / PLANE.fuel), 12);
    // Seconds left on the tank, in figures beside the bar: the bar says
    // roughly, the number says exactly, and the number is what a pilot
    // deciding whether to firewall the throttle actually reads.
    context.textBaseline = 'alphabetic';
    text(`${Math.ceil(state.fuel)}s`, 868, top + 86, 13, state.fuel < 30 ? PALETTE.danger : PALETTE.hudDim, 'left');
    // Next ring: a small readout so the pilot always knows the target.
    const next = state.rings.find((ring) => !ring.passed);
    text(state.landed ? 'LANDED ON THE RUNWAY' : next ? `NEXT RING  ${Math.max(0, Math.round(next.z - plane.z))} m` : 'RUNWAY AHEAD — LINE UP', 900, top + 34, 15, PALETTE.gaugeLit, 'left');
    text(state.landed ? 'WELL FLOWN' : next ? `RING ${state.ringsHit + 1} OF ${state.rings.length}` : 'FINAL APPROACH', 900, top + 62, 13, PALETTE.hudDim, 'left');
  }

  function drawHud(state, screen) {
    const plane = state.plane;
    context.textBaseline = 'top';
    // A soft shadow keeps white text readable over bright sky and clouds.
    context.shadowColor = 'rgba(13,20,32,0.55)';
    context.shadowBlur = 6;
    context.shadowOffsetY = 1;
    text(`ALT ${Math.round(plane.altitude)} m`, 24, 20, 26, PALETTE.hudText, 'left');
    text(`SPD ${Math.round(plane.speed * 3.6)} km/h`, 24, 52, 26, PALETTE.hudText, 'left');
    // The crosswind, in figures and an arrow: the gust is the reason the
    // plane keeps sliding off the line, so the pilot sees it, not just
    // feels it. Positive wind pushes right, negative pushes left.
    const windArrow = state.wind > 0.5 ? '→' : state.wind < -0.5 ? '←' : '—';
    text(`WIND ${Math.abs(Math.round(state.wind))} m/s ${windArrow}`, 24, 86, 18, PALETTE.hudDim, 'left');
    // Compass tape across the top centre.
    const heading = Math.round(((plane.heading % 360) + 360) % 360) % 360;
    text(headingLabel(heading), CX, 20, 26, PALETTE.hudText, 'center');
    const marks = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let offset = -90; offset <= 90; offset += 15) {
      const hdg = ((heading + offset) % 360 + 360) % 360;
      const x = CX + offset * 2.4;
      const isCardinal = hdg % 45 === 0;
      context.fillStyle = isCardinal ? PALETTE.hudText : PALETTE.hudDim;
      context.fillRect(x - 1, 52, 2, isCardinal ? 12 : 7);
      if (isCardinal) text(marks[Math.round(hdg / 45) % 8], x, 68, 13, PALETTE.hudText, 'center');
    }
    text(scoreLabel(Math.round(state.score)), FIELD.width - 24, 20, 26, PALETTE.hudText, 'right');
    const ringsText = state.combo > 1
      ? `${state.ringsHit}/${state.rings.length}  COMBO x${state.combo}`
      : `${state.ringsHit}/${state.rings.length}`;
    text(ringsLabel(ringsText), FIELD.width - 24, 52, 20, PALETTE.hudDim, 'right');
    text(timeLabel(`${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`), FIELD.width - 24, 78, 20, PALETTE.hudDim, 'right');
    if (state.fuel <= 0 && screen === SCREEN_PLAY) {
      text('FUEL EMPTY — GLIDE TO THE RUNWAY', CX, 108, 22, PALETTE.danger, 'center');
    }
    if (state.flash && state.flashUntil > state.elapsed) {
      context.globalAlpha = Math.min(1, (state.flashUntil - state.elapsed) * 2);
      text(state.flash, CX, 140, 30, PALETTE.ringGlow, 'center');
      context.globalAlpha = 1;
    }
    // The shadow belongs to the HUD text only: clear it before anything
    // else is painted, or the terrain and rings would carry it too.
    context.shadowColor = 'rgba(0,0,0,0)';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2 - 40;
    context.fillStyle = 'rgba(20,26,36,0.92)';
    context.beginPath();
    context.roundRect(x, y, PANEL.width, height, 14);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.hudText, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.hudDim, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.ringGlow, 'center');
  }

  const TITLE_LINES = [
    'Fly the courier plane down the Merapi ridge,',
    'through all eight glowing rings, then land on the runway.',
    'Wind gusts push you sideways — chain rings for combo bonuses.',
    'Arrows or WASD: pitch and bank · Shift / Ctrl: throttle',
    'Mouse: steer · Space: start · P: pause',
    '',
  ];

  /** Paint one frame: sky, terrain, runway, rings, plane, instruments, HUD. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0d1420';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky(state);
    drawTerrain(state);
    drawTown(state);
    drawRunway(state);
    drawRings(state);
    drawPlane(state);
    drawInstruments(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[5] = bestLabel(best);
      drawPanel('Merapi Ridge Run', TITLE_LINES, 'Press Space or click to fly');
      return;
    }
    drawHud(state, screen);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The ridge will wait for you.'], 'Press P to keep flying');
    } else if (screen === SCREEN_OVER) {
      const lines = state.landed
        ? ['You put her down on the runway.', state.landingSoft ? 'A soft landing — nicely flown.' : 'A firm landing, but she is in one piece.', finalLabel(Math.round(state.score)), bestLabel(best)]
        : [state.crashReason || 'Game over', finalLabel(Math.round(state.score)), bestLabel(best)];
      drawPanel(state.landed ? 'Landed!' : 'Crashed', lines, 'Press Space or click to fly again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
