/* Smooth overlay motion between shape position samples.

   The server sends shape positions about ten times a second (Smargon is polled
   every 100 ms), and over socket.io long-polling they arrive in bursts. Drawn
   as they come, a grid being rastered moves in irregular steps. Instead the
   overlay is drawn a short delay behind the server time and each shape slides
   between the two samples around that moment: always smooth, never ahead of a
   real position, and a stop is just repeated samples. The trajectory is not
   predicted (the Tango collect server moves the Smargon, MXCuBE does not know
   its speed or pauses).

   Times are in ms. Server timestamps are seconds since the epoch; the clocks
   need not agree, only their offset is used. */

const KEEP_MS = 2000;
const MIN_DELAY_MS = 120;
const MAX_DELAY_MS = 500;
const LATENESS_WINDOW = 30;

const samples = new Map(); // shape id -> [{t, screenCoord, fade, state}]
let offset = null; // min(arrival - server time): server time -> browser time
const lateness = []; // recent arrival lateness beyond the offset
let period = 100; // recent interval between samples
let lastT = null;
let newestT = null;
let received = 0; // samples since the last debug report
// The render clock (see renderTime): a change of delay is taken up at most
// SLEW faster or slower than real time
const SLEW = 0.1;
let lastNow = null;
let lastRender = null;

// The delay the overlay is drawn behind the server time: enough for the
// latest burst to have arrived, within bounds
export function currentDelay() {
  const late = lateness.length > 0 ? Math.max(...lateness) : 0;
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, late + period));
}

// Clock offset, arrival lateness and sample period from one message
function noteTiming(tMs, arrival) {
  const diff = arrival - tMs;
  if (offset === null || diff < offset) {
    offset = diff;
  }
  lateness.push(diff - offset);
  if (lateness.length > LATENESS_WINDOW) {
    lateness.shift();
  }
  // A pause between two motions is not a sample period
  if (lastT !== null && tMs > lastT && tMs - lastT < 3 * period) {
    period = 0.8 * period + 0.2 * (tMs - lastT);
  }
  lastT = tMs;
  newestT = newestT === null ? tMs : Math.max(newestT, tMs);
}

// Insert a sample in a shape's time-sorted list (messages may come out of
// order inside a burst) and drop the samples too old to be drawn
function insertSample(list, sample) {
  let i = list.length;
  while (i > 0 && list[i - 1].t > sample.t) {
    i -= 1;
  }
  // Positions are only sent on a change: after a pause the shape was still
  // until about one sample period ago, it must not slide over the pause
  const prev = list[i - 1];
  if (prev && i === list.length && sample.t - prev.t > 3 * period) {
    list.push({ ...prev, t: sample.t - period });
    i += 1;
  }
  list.splice(i, 0, sample);
  while (list.length > 2 && list[1].t < sample.t - KEEP_MS) {
    list.shift();
  }
}

/* Record the positions of a server message. t: server time in seconds,
   positions: {id: {screenCoord, fade, state}} for every shape there is,
   arrival: browser time (ms). */
export function addSample(t, positions, arrival = performance.now()) {
  if (typeof t !== 'number') {
    return;
  }
  const tMs = t * 1000;
  received += 1;
  noteTiming(tMs, arrival);

  // A sample from before what is already drawn would change the motion
  // after the fact (a step back): only its timing counts
  const late = lastRender !== null && tMs < lastRender;

  for (const [id, p] of Object.entries(positions)) {
    const list = samples.get(id) || [];
    if (p?.screenCoord && !(late && list.length > 0)) {
      insertSample(list, {
        t: tMs,
        screenCoord: p.screenCoord,
        fade: p.fade,
        state: p.state,
      });
      samples.set(id, list);
    }
  }

  // Every message lists all shapes: the others are gone
  for (const id of samples.keys()) {
    if (!(id in positions)) {
      samples.delete(id);
    }
  }
}

/* The server time drawn at browser time `now`. It never goes back, and a
   change of the delay (a later burst, a new offset) is taken up gradually, by
   running at most SLEW faster or slower than real time, and it waits at the
   newest sample when the next one is late: the overlay never jumps or steps
   back. */

function renderTime(now) {
  const target = now - offset - currentDelay();
  if (lastNow === null || now < lastNow || now - lastNow > 1000) {
    lastNow = now;
    lastRender = target;
    return target;
  }
  if (now === lastNow) {
    return lastRender;
  }
  const dt = now - lastNow;
  const free = lastRender + dt;
  const step = Math.max(-SLEW * dt, Math.min(SLEW * dt, target - free));
  lastNow = now;
  // Starved (the next sample is late): wait at the newest one rather than
  // run past it, or the shape would jump when the sample comes
  lastRender = Math.max(lastRender, Math.min(free + step, newestT ?? free));
  return lastRender;
}

function blend(a, b, f) {
  if (a.length !== b.length) {
    return f < 1 ? a : b;
  }
  return a.map((v, i) => v + (b[i] - v) * f);
}

/* The position of a shape at the render time: screenCoord blended between
   the samples around it, fade and state from the earlier one (a blended fade
   would rebuild the grid on every frame). null without samples. */
export function positionAt(id, now = performance.now()) {
  const list = samples.get(id);
  if (!list || list.length === 0 || offset === null) {
    return null;
  }
  const rt = renderTime(now);

  if (rt <= list[0].t) {
    return list[0];
  }
  const last = list.at(-1);
  if (rt >= last.t) {
    return last;
  }

  let i = list.length - 1;
  while (list[i - 1].t > rt) {
    i -= 1;
  }
  const a = list[i - 1];
  const b = list[i];
  const f = (rt - a.t) / (b.t - a.t);
  return {
    t: rt,
    screenCoord: blend(a.screenCoord, b.screenCoord, f),
    fade: a.fade,
    state: a.state,
  };
}

// True while the render time has not reached the newest sample: the overlay
// is still sliding and has to be drawn again on the next frame
export function moving(now = performance.now()) {
  return newestT !== null && offset !== null && renderTime(now) < newestT;
}

// Samples received since the last call (localStorage.overlayDebug report)
export function takeReceivedCount() {
  const n = received;
  received = 0;
  return n;
}

// Forget everything (tests)
export function resetMotion() {
  samples.clear();
  lateness.length = 0;
  offset = null;
  period = 100;
  lastT = null;
  newestT = null;
  received = 0;
  lastNow = null;
  lastRender = null;
}
