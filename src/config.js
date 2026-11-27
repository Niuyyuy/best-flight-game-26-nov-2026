// Merapi Ridge Run — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Focal length for the pseudo-3D projection, in logical pixels. */
export const FOCAL = 520;

/** How far ahead, in metres, the terrain is drawn. */
export const VIEW_DISTANCE = 2600;

/** The whole course, in metres from the start line to the runway threshold. */
export const COURSE = {
  length: 9200,
  runwayStart: 8800,
  runwayEnd: 9150,
  runwayHalfWidth: 26,
  startAltitude: 180,
  startSpeed: 72,
  lateralLimit: 420,
  maxAltitude: 620,
};

export const PLANE = {
  /** Metres per second at full throttle, and at idle. */
  speedMax: 148,
  speedMin: 34,
  /** How fast the throttle moves toward its target, per second. */
  throttleRate: 0.45,
  /** Climb and sink, metres per second at full pitch and cruise speed. */
  climbRate: 26,
  sinkRate: 34,
  /** Degrees of bank per second of held input, and the bank cap. */
  rollRate: 95,
  rollMax: 52,
  /** Heading change, degrees per second, at full bank. */
  turnRate: 26,
  /** Fuel, in seconds of full-throttle flight. A full course takes about
   *  95 seconds of flying, so 180 seconds makes the throttle a real choice:
   *  firewall it the whole way and the tank is dry before the runway. */
  fuel: 180,
};

/**
 * The crosswind: a slow, seeded gust that slides the plane sideways as it
 * flies down the course, strongest where the valley narrows. It never
 * exceeds WIND.max metres per second, and the sign flips with the terrain,
 * so the pilot is always crabbing a little to hold the line.
 */
export const WIND = {
  max: 5,
  /** How quickly the gust changes along the course, per metre. */
  wander: 0.0006,
  /** The noise offset, so the wind's pattern never matches the river's. */
  offset: 9.1,
};

export const RINGS = [
  { z: 900, x: -40, y: 200, r: 42 },
  { z: 1800, x: 120, y: 260, r: 42 },
  { z: 2700, x: -140, y: 210, r: 40 },
  { z: 3600, x: 60, y: 300, r: 40 },
  { z: 4500, x: -230, y: 290, r: 38 },
  { z: 5400, x: -180, y: 270, r: 38 },
  { z: 6300, x: 40, y: 320, r: 38 },
  { z: 7200, x: -60, y: 230, r: 36 },
];

export const SCORE = {
  ring: 250,
  ringPerfect: 150,
  /** A pass counts as perfect inside this fraction of the ring's radius. */
  perfectFraction: 0.45,
  /** Each ring in an unbroken chain adds this much again: the second ring
   *  in a row is worth 50 more than the first, the third 100 more, and so
   *  on — missing a ring breaks the chain back to zero. */
  comboStep: 50,
  landing: 1000,
  landingSoft: 400,
  second: -1,
};

export const PALETTE = {
  skyTop: '#2f6fb8',
  skyMid: '#7db3e0',
  skyHorizon: '#cfe6f2',
  sun: '#fff3c4',
  cloud: '#ffffff',
  cloudShade: '#d7e4f0',
  ridgeFar: '#7d94b8',
  ridgeMid: '#6b84a6',
  ridgeSilhouette: '#546e92',
  smoke: '#e9eef2',
  shadow: 'rgba(10,18,28,0.30)',
  runwayLight: '#ffe9a8',
  runwayLightEdge: '#ffb02e',
  ridgeNear: '#5d7a52',
  fieldA: '#6da24f',
  fieldB: '#8fae4e',
  fieldC: '#c2a95c',
  forest: '#3f6b35',
  river: '#3f8fd2',
  water: '#2f7fc4',
  townRoof: '#8a6f5c',
  townWall: '#b9a894',
  volcanoRock: '#6e6258',
  volcanoSnow: '#f4f7f8',
  runway: '#3a3f46',
  runwayMark: '#f2f2e8',
  ring: '#ffb02e',
  ringGlow: '#ffcf6e',
  ringDone: '#58d68d',
  planeBody: '#e8542f',
  planeWing: '#f6f1e6',
  planeTrim: '#1f2a3a',
  panel: '#141a24',
  panelEdge: '#2c3648',
  gaugeFace: '#0d1420',
  gaugeLit: '#9fe8ff',
  gaugeAmber: '#ffc46b',
  hudText: '#ffffff',
  hudDim: '#c8d6e2',
  danger: '#ff5a4e',
  ok: '#7be495',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'merapi-ridge-run.best';
