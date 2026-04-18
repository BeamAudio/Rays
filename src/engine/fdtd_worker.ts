import { fft } from './fft';

// FDTD Acoustic Engine — Web Worker
// Second-order 2D scalar wave equation on a Cartesian grid.
// Accuracy settings (gridRes, fftSize, chunkSize) are passed from the main thread.

let p0: Float32Array;
let p1: Float32Array;
let p2: Float32Array;
let boundaryMap: Uint8Array;
let gridNx = 200;
let gridNy = 200;

let isRunning = false;

let config = {
  dx: 0.02, // spatial resolution (m/cell)
  c:  343,  // speed of sound (m/s)
  dt: 0,
  srcX: 100,
  srcY: 190,
  mode: 'impulse' as 'impulse' | 'cw',
  freq: 500,
};

let stepCount   = 0;
let lastPostTime = 0;

// ─── Configurable accuracy knobs (set from INIT payload) ─────────────────────
let FFT_SIZE  = 8192;
let CHUNK_SIZE = 256;

let p1_record: Float64Array;
let p2_record: Float64Array;
let mic1_loc = 0;
let mic2_loc = 0;

// ─── Message handler ─────────────────────────────────────────────────────────
self.onmessage = (e) => {
  const { type } = e.data;

  if (type === 'INIT') {
    const { nx, ny, walls, sourceX, sourceY, simMode, frequency, fftSize, chunkSize } = e.data.payload;

    gridNx    = nx;
    gridNy    = ny;
    FFT_SIZE  = fftSize   || 8192;
    CHUNK_SIZE = chunkSize || 256;

    p0 = new Float32Array(nx * ny);
    p1 = new Float32Array(nx * ny);
    p2 = new Float32Array(nx * ny);
    p1_record = new Float64Array(FFT_SIZE);
    p2_record = new Float64Array(FFT_SIZE);

    boundaryMap  = walls;
    config.srcX  = Math.floor(sourceX);
    config.srcY  = Math.floor(sourceY);
    config.mode  = (simMode === 'impedance' ? 'impulse' : simMode) || 'impulse';
    config.freq  = frequency || 500;
    config.dx    = 0.02;
    config.dt    = config.dx / (config.c * Math.SQRT2);

    stepCount    = 0;
    isRunning    = true;

    self.postMessage({
      type: 'LOG',
      message: `FDTD init ${nx}×${ny} · dx=${config.dx*100}cm · dt=${config.dt.toExponential(3)}s · mode=${simMode}`,
    });

    if (simMode === 'impedance') {
      // Two-mic impedance tube: mics placed between source (bottom) and sample (centre)
      const mic1Y = Math.floor(ny * 0.675);
      const mic2Y = Math.floor(ny * 0.65);
      mic1_loc = mic1Y * nx + config.srcX;
      mic2_loc = mic2Y * nx + config.srcX;
      runImpedanceTest();
    } else {
      loop();
    }
  }

  if (type === 'STOP') {
    isRunning = false;
  }
};

// ─── Impedance extraction (chunked — non-blocking) ───────────────────────────
function runImpedanceTest() {
  const CourantSq = Math.pow((config.c * config.dt) / config.dx, 2);
  const nx = gridNx, ny = gridNy;
  const C0 = (config.c * config.dt - config.dx) / (config.c * config.dt + config.dx);
  const spread = 0.005;
  const t0     = 0.02;

  self.postMessage({ type: 'PROGRESS', progress: 0 });
  self.postMessage({ type: 'LOG', message: `Running ${FFT_SIZE}-step impulse (chunk=${CHUNK_SIZE})…` });

  let s = 0;

  function processChunk() {
    if (!isRunning) {
      self.postMessage({ type: 'LOG', message: 'Aborted by user.' });
      return;
    }

    const endS = Math.min(s + CHUNK_SIZE, FFT_SIZE);

    for (; s < endS; s++) {
      const t      = s * config.dt;
      const srcIdx = config.srcY * nx + config.srcX;

      // Gaussian impulse injection
      p0[srcIdx] += 10.0 * Math.exp(-Math.pow((t - t0) / spread, 2));

      // Wave equation interior update
      for (let y = 1; y < ny - 1; y++) {
        for (let x = 1; x < nx - 1; x++) {
          const idx = y * nx + x;
          if (boundaryMap[idx] === 1) { p2[idx] = 0; continue; }
          const lap = p0[idx - 1] + p0[idx + 1] + p0[idx - nx] + p0[idx + nx] - 4 * p0[idx];
          p2[idx]   = 2 * p0[idx] - p1[idx] + CourantSq * lap;
        }
      }

      // First-order ABC (Mur) on all four boundaries
      for (let x = 0; x < nx; x++) {
        p2[x]                 = p1[nx + x]            + C0 * (p2[nx + x]            - p0[x]);
        p2[(ny - 1) * nx + x] = p1[(ny - 2) * nx + x] + C0 * (p2[(ny - 2) * nx + x] - p0[(ny - 1) * nx + x]);
      }
      for (let y = 0; y < ny; y++) {
        p2[y * nx]          = p1[y * nx + 1]          + C0 * (p2[y * nx + 1]          - p0[y * nx]);
        p2[y * nx + nx - 1] = p1[y * nx + nx - 2]     + C0 * (p2[y * nx + nx - 2]     - p0[y * nx + nx - 1]);
      }

      // Record mic signals
      p1_record[s] = p0[mic1_loc];
      p2_record[s] = p0[mic2_loc];

      // Swap buffers
      const tmp = p1; p1 = p0; p0 = p2; p2 = tmp;
    }

    const progress = Math.floor((s / FFT_SIZE) * 90);
    self.postMessage({ type: 'PROGRESS', progress });

    if (s < FFT_SIZE) {
      // Yield to allow STOP messages and progress rendering
      setTimeout(processChunk, 0);
    } else {
      finishImpedanceTest();
    }
  }

  processChunk();
}

function finishImpedanceTest() {
  self.postMessage({ type: 'PROGRESS', progress: 92 });
  self.postMessage({ type: 'LOG', message: 'FFT post-processing…' });

  const im1 = new Float64Array(FFT_SIZE);
  const im2 = new Float64Array(FFT_SIZE);
  fft(p1_record, im1);
  fft(p2_record, im2);

  const df     = 1.0 / (FFT_SIZE * config.dt);
  const s_dist = 5  * config.dx;  // mic spacing (5 cells)
  const x1_dist = 30 * config.dx; // mic-2 to sample face
  const rho_c   = 413.0;          // specific acoustic impedance of air

  const freqs: number[] = [];
  const mags:  number[] = [];
  const phases: number[] = [];

  for (let i = 1; i < FFT_SIZE / 2; i++) {
    const f = i * df;
    if (f > 2500) break;
    if (f < 50)   continue;

    freqs.push(f);

    // Complex H₁₂ = P₂ / P₁
    const P1R = p1_record[i], P1I = im1[i];
    const P2R = p2_record[i], P2I = im2[i];
    const denom  = P1R * P1R + P1I * P1I + 1e-30;
    const H12R   = (P2R * P1R + P2I * P1I) / denom;
    const H12I   = (P2I * P1R - P2R * P1I) / denom;

    // ISO 10534-2 two-mic transfer function method
    const k       = 2 * Math.PI * f / config.c;
    const ck      = Math.cos(k * s_dist), sk = Math.sin(k * s_dist);

    const R_num_r = H12R - ck,        R_num_i = H12I + sk;
    const R_den_r = ck   - H12R,      R_den_i = -sk  - H12I;
    const r_dm    = R_den_r * R_den_r + R_den_i * R_den_i + 1e-30;
    const R_int_r = (R_num_r * R_den_r + R_num_i * R_den_i) / r_dm;
    const R_int_i = (R_num_i * R_den_r - R_num_r * R_den_i) / r_dm;

    const e_r = Math.cos(2 * k * x1_dist), e_i = Math.sin(2 * k * x1_dist);
    const Rr  = R_int_r * e_r - R_int_i * e_i;
    const Ri  = R_int_r * e_i + R_int_i * e_r;

    // Z = ρc · (1+R)/(1−R)
    const Zn_r = 1 + Rr, Zn_i = Ri;
    const Zd_r = 1 - Rr, Zd_i = -Ri;
    const z_dm = Zd_r * Zd_r + Zd_i * Zd_i + 1e-30;
    const Zr   = rho_c * (Zn_r * Zd_r + Zn_i * Zd_i) / z_dm;
    const Zi   = rho_c * (Zn_i * Zd_r - Zn_r * Zd_i) / z_dm;

    const mag = Math.sqrt(Zr * Zr + Zi * Zi);
    let   ph  = Math.atan2(Zi, Zr) * (180 / Math.PI);
    if (ph >  180) ph -= 360;
    if (ph < -180) ph += 360;

    mags.push(Math.max(1, mag));
    phases.push(ph);
  }

  self.postMessage({ type: 'PROGRESS', progress: 100 });
  self.postMessage({ type: 'LOG', message: `✓ Done — ${freqs.length} bins · df = ${df.toFixed(1)} Hz` });
  // @ts-ignore
  self.postMessage({ type: 'IMPEDANCE_RESULTS', freqs, mags, phases });
  isRunning = false;
}

// ─── Live FDTD loop (real-time wave visualisation) ───────────────────────────
function loop() {
  if (!isRunning) return;

  const STEPS      = 15;
  const CourantSq  = Math.pow((config.c * config.dt) / config.dx, 2);
  const nx = gridNx, ny = gridNy;
  const C0 = (config.c * config.dt - config.dx) / (config.c * config.dt + config.dx);

  for (let s = 0; s < STEPS; s++) {
    const t      = stepCount * config.dt;
    const srcIdx = config.srcY * nx + config.srcX;

    if (config.mode === 'impulse') {
      const spread = 0.0015, t0 = 0.005;
      p0[srcIdx] += 1.5 * Math.exp(-Math.pow((t - t0) / spread, 2));
    } else {
      p0[srcIdx] = Math.sin(2 * Math.PI * config.freq * t);
    }

    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const idx = y * nx + x;
        if (boundaryMap[idx] === 1) { p2[idx] = 0; continue; }
        const lap = p0[idx - 1] + p0[idx + 1] + p0[idx - nx] + p0[idx + nx] - 4 * p0[idx];
        p2[idx]   = (2 * p0[idx] - p1[idx] + CourantSq * lap) / 1.0001; // tiny damping
      }
    }

    for (let x = 0; x < nx; x++) {
      p2[x]                 = p1[nx + x]            + C0 * (p2[nx + x]            - p0[x]);
      p2[(ny - 1) * nx + x] = p1[(ny - 2) * nx + x] + C0 * (p2[(ny - 2) * nx + x] - p0[(ny - 1) * nx + x]);
    }
    for (let y = 0; y < ny; y++) {
      p2[y * nx]          = p1[y * nx + 1]      + C0 * (p2[y * nx + 1]      - p0[y * nx]);
      p2[y * nx + nx - 1] = p1[y * nx + nx - 2] + C0 * (p2[y * nx + nx - 2] - p0[y * nx + nx - 1]);
    }

    const tmp = p1; p1 = p0; p0 = p2; p2 = tmp;
    stepCount++;
  }

  const now = performance.now();
  if (now - lastPostTime > 16) {
    const clone = new Float32Array(p0);
    // @ts-ignore
    self.postMessage({ type: 'RENDER', pressureMap: clone.buffer }, [clone.buffer]);
    lastPostTime = now;
  }

  setTimeout(loop, 0);
}
