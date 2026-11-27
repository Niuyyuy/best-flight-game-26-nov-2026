// Keyboard and pointer input. Held keys give pitch, roll and throttle
// change; one-shot presses (start or restart, pause) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost and
// never counted twice. The mouse steers too: where the pointer sits across
// the window sets the bank, and where it sits up and down sets the pitch.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  // Pointer steering, as fractions of the window: -1..1 across, -1..1 down.
  let pointerX = 0;
  let pointerY = 0;
  let pointerActive = false;
  let pointerTime = 0;
  // The mouse wheel nudges the throttle: a roll up adds, a roll down cuts.
  let wheelThrottle = 0;

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else {
      keys.add(event.code);
    }
    if (PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code) || ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code) || THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    pointerActive = false;
  });
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    pointerActive = true;
    pointerTime = performance.now();
    updatePointer(event);
  });
  target.addEventListener('pointermove', (event) => {
    if (pointerActive) updatePointer(event);
  });
  target.addEventListener('pointerup', () => {
    pointerActive = false;
  });
  target.addEventListener('wheel', (event) => {
    wheelThrottle += event.deltaY < 0 ? 0.12 : -0.12;
    wheelThrottle = Math.max(-0.6, Math.min(0.6, wheelThrottle));
    event.preventDefault();
  }, { passive: false });

  function updatePointer(event) {
    const rect = target.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointerY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    pointerTime = performance.now();
  }

  function hasAny(codes) {
    for (const code of codes) if (keys.has(code)) return true;
    return false;
  }

  return {
    /**
     * The pilot's control for this frame: pitch -1..1 (up positive), roll
     * -1..1 (right positive) and throttle change -1..1. Keys win over the
     * pointer when both are held; the pointer fades out after two seconds
     * without a move, so a parked mouse never fights the keys.
     */
    control() {
      let pitch = 0;
      let roll = 0;
      let throttle = 0;
      if (hasAny(PITCH_UP)) pitch += 1;
      if (hasAny(PITCH_DOWN)) pitch -= 1;
      if (hasAny(ROLL_LEFT)) roll -= 1;
      if (hasAny(ROLL_RIGHT)) roll += 1;
      if (hasAny(THROTTLE_UP)) throttle += 1;
      if (hasAny(THROTTLE_DOWN)) throttle -= 1;
      if (wheelThrottle !== 0) {
        throttle += wheelThrottle;
        wheelThrottle *= 0.9;
        if (Math.abs(wheelThrottle) < 0.02) wheelThrottle = 0;
      }
      if (pitch === 0 && roll === 0 && pointerActive && performance.now() - pointerTime < 2000) {
        roll = Math.max(-1, Math.min(1, pointerX * 1.4));
        pitch = Math.max(-1, Math.min(1, -pointerY * 1.2));
      }
      return { pitch, roll, throttle };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
