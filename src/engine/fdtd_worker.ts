import { fft } from './fft';

// FDTD Acoustic Engine — Web Worker
// 2D scalar wave equation with Convolutional Perfectly Matched Layer (C-PML)
// absorbing boundaries. Replaces the first-order Mur ABC which produced
// visible reflections at domain edges.
//
// PML implementation follows:
//   Roden & Gedney (2000), "Convolution PML (CPML): An efficient FDTD…"
//   Applied here as the split-field approach for 2D acoustics:
//     pml_x / pml_y auxiliary fields accumulate memory integrals of ∂p/∂x, ∂p/∂y.
//
// Update equation in PML zone (per axis):
//   Φ_new = b·Φ_old + a·(p_new - p_old) / dx   (memory convolution)
//   p2 = 2·p0 - p1 + CourantSq·(lap_interior + Φ correction)
//
// Outside PML: standard FDTD with no extra cost.

// ─── PML parameters ──────────────────────────────────────────────────────────
// NPML: thickness in grid cells. 15 is a good trade-off; increase to 20 for
//       higher accuracy at the cost of effective domain reduction.
const NPML      = 15;
// Polynomial grading order (m=2 standard; higher → smoother but thicker PML needed)
const PML_ORDER = 2;
// Target reflection coefficient R0 (theoretical; lower = thicker PML needed)
const R0        = 1e-4;  // –80 dB

// ─── State ───────────────────────────────────────────────────────────────────
let p0: Float32Array;   // pressure at t_n     (current)
let p1: Float32Array;   // pressure at t_{n-1} (previous)
let p2: Float32Array;   // pressure at t_{n+1} (output buffer)

// C-PML auxiliary memory fields (one per axis, interior + PML cells)
let pml_x: Float32Array;  // Φx
let pml_y: Float32Array;  // Φy

// Pre-computed C-PML coefficients per column / row
let b_x: Float32Array;      // exp(-σ_x·dt)
let b_y: Float32Array;
let a_x: Float32Array;      // (b_x - 1) · σ_x / (σ_x · κ_x + ···)
let a_y: Float32Array;

let boundaryMap: Uint8Array;
let gridNx = 200;
let gridNy = 200;
let isRunning = false;

const config = {
  dx:   0.02,   // m/cell
  c:    343.0,  // m/s
  dt:   0.0,
  srcX: 100,
  srcY: 100,
  mode: 'impulse' as 'impulse' | 'cw',
  freq: 500,
  stepsPerFrame: 15,
  dtScale: 1.0,
};

let stepCount    = 0;
let lastPostTime = 0;
let FFT_SIZE     = 8192;
let CHUNK_SIZE   = 256;


let p1_record: Float64Array;
let p2_record: Float64Array;
let mic1_loc = 0;
let mic2_loc = 0;

// ─── C-PML coefficient builder ────────────────────────────────────────────────
// Returns {b, a} arrays of length N.
// b[i] = decay factor per step in PML cell i
// a[i] = update weight for auxiliary Φ field
// For interior cells, σ=0 → b=1, a=0 (standard FDTD, no overhead in the inner loop).
function buildPML(N: number, dt: number, dx: number, c: number): {
  sigma: Float32Array; b: Float32Array; a: Float32Array;
} {
  const sigma = new Float32Array(N);
  const b     = new Float32Array(N);
  const a     = new Float32Array(N);

  // σ_max chosen for R0 reflection coefficient, quadratic polynomial grading
  // σ_max = -(m+1)·c·ln(R0) / (2·NPML·dx)
  const sigmaMax = -(PML_ORDER + 1) * c * Math.log(R0) / (2 * NPML * dx);

  for (let i = 0; i < N; i++) {
    // Distance from PML inner edge (0 = inner boundary, NPML = outer boundary)
    let d = 0;
    if (i < NPML)       d = NPML - i;           // left / top PML
    if (i >= N - NPML)  d = i - (N - 1 - NPML); // right / bottom PML

    if (d <= 0) {
      // Interior — identity coefficients, Φ contribution = 0
      b[i] = 1.0;
      a[i] = 0.0;
    } else {
      // Graded absorption profile σ(d) = σ_max·(d/NPML)^m
      const profile = (d / NPML) ** PML_ORDER;
      const sig = sigmaMax * profile;
      sigma[i] = sig;
      // b = exp(-σ·dt)  →  geometric decay factor per time step
      b[i] = Math.exp(-sig * dt);
      // a = σ·(b-1)/... using the simple CPML relation:
      //   a = (b - 1) means Φ accumulates the derivative difference (first-order)
      //   Normalised by 1/dx so Φ is added directly to the Laplacian correction
      a[i] = (b[i] - 1.0) / (sig * dx + 1e-30);
    }
  }

  return { sigma, b, a };
}

// ─── One FDTD+PML step ───────────────────────────────────────────────────────
// Updates p2 from p0 (t_n) and p1 (t_{n-1}), applying C-PML at the perimeter.
// Mutates pml_x, pml_y in-place (memory fields).
function stepFDTD(CourantSq: number): void {
  const nx = gridNx, ny = gridNy;

  for (let y = 1; y < ny - 1; y++) {
    const by = b_y[y], ay = a_y[y];

    for (let x = 1; x < nx - 1; x++) {
      const idx = y * nx + x;

      // Hard-wall object: keep pressure = 0
      if (boundaryMap[idx] === 1) { p2[idx] = 0.0; continue; }

      // Standard second-order centred Laplacian
      const dp_dx = p0[idx + 1] - 2.0 * p0[idx] + p0[idx - 1]; // × 1/dx²
      const dp_dy = p0[idx + nx] - 2.0 * p0[idx] + p0[idx - nx];

      // ── C-PML corrections ──────────────────────────────────────────────────
      // Φx: memory of ∂p/∂x difference, updated each step
      const bx = b_x[x], ax_ = a_x[x];
      const by_v = by, ay_ = ay;

      let pxCorr = 0.0, pyCorr = 0.0;

      if (ax_ !== 0.0) {
        // Derivative of (p0[idx+1] - p0[idx-1]) as proxy for ∂p/∂x change
        const diff_x = (p0[idx + 1] - p0[idx - 1]) * 0.5; // centred, ×1/dx
        const newPx  = bx * pml_x[idx] + ax_ * diff_x;
        pxCorr       = newPx - pml_x[idx]; // incremental correction
        pml_x[idx]   = newPx;
      }
      if (ay_ !== 0.0) {
        const diff_y = (p0[idx + nx] - p0[idx - nx]) * 0.5;
        const newPy  = by_v * pml_y[idx] + ay_ * diff_y;
        pyCorr       = newPy - pml_y[idx];
        pml_y[idx]   = newPy;
      }

      // Modified Laplacian: standard lap + PML stretching correction terms
      const lap = dp_dx + dp_dy + pxCorr + pyCorr;

      p2[idx] = 2.0 * p0[idx] - p1[idx] + CourantSq * lap;
    }
  }

  // Outer edge rows/columns: enforce Dirichlet p=0 (Mur not needed — PML
  // attenuates waves to <0.01% before they reach the very edge).
  // (They remain 0 from the initialised Float32Array; no action needed.)
}

// ─── Initialization ───────────────────────────────────────────────────────────
self.onmessage = (e: MessageEvent) => {
  const { type } = e.data;

  if (type === 'INIT') {
    const { nx, ny, walls, sourceX, sourceY, simMode, frequency, fftSize, chunkSize, domainSizeM, stepsPerFrame, dtScale } = e.data.payload;

    gridNx     = nx;
    gridNy     = ny;
    FFT_SIZE   = fftSize   || 8192;
    CHUNK_SIZE = chunkSize || 256;

    config.stepsPerFrame = stepsPerFrame || 15;
    config.dtScale       = dtScale       || 1.0;


    p0 = new Float32Array(nx * ny);
    p1 = new Float32Array(nx * ny);
    p2 = new Float32Array(nx * ny);

    // C-PML auxiliary fields — zero-initialised (no prior memory)
    pml_x = new Float32Array(nx * ny);
    pml_y = new Float32Array(nx * ny);

    p1_record  = new Float64Array(FFT_SIZE);
    p2_record  = new Float64Array(FFT_SIZE);
    boundaryMap = walls;

    // PHYSICAL SYNC: Calculate dx from domain size and resolution
    const size = domainSizeM || 2.0; 
    config.dx = size / nx;
    config.dt = (config.dx / (config.c * Math.SQRT2)) * config.dtScale; // Scaled CFL stability

    // Build per-axis C-PML coefficient vectors
    const cx = buildPML(nx, config.dt, config.dx, config.c);
    const cy = buildPML(ny, config.dt, config.dx, config.c);
    b_x = cx.b; a_x = cx.a;
    b_y = cy.b; a_y = cy.a;

    // Clamp source strictly inside PML-free interior
    const intXmin = NPML + 1, intXmax = nx - NPML - 2;
    const intYmin = NPML + 1, intYmax = ny - NPML - 2;
    config.srcX = Math.max(intXmin, Math.min(intXmax, Math.round(sourceX)));
    config.srcY = Math.max(intYmin, Math.min(intYmax, Math.round(sourceY)));

    config.mode = (simMode === 'impedance' ? 'impulse' : simMode) || 'impulse';
    config.freq  = frequency || 500;

    stepCount = 0; isRunning = true;

    self.postMessage({ type: 'LOG',
      message: `FDTD sync: ${nx}² · dx=${(config.dx*100).toFixed(2)}cm · dt=${(config.dt*1e6).toFixed(1)}μs · R₀=${R0}` });

    if (simMode === 'impedance') {
      // Two-mic impedance tube — s and x1 distances are now physically relative
      const srcYimp = ny - NPML - 5;
      config.srcY   = srcYimp;
      const mic1Y   = srcYimp - 30;   // 30 cells
      const mic2Y   = srcYimp - 35;   // 35 cells
      mic1_loc = mic1Y * nx + config.srcX;
      mic2_loc = mic2Y * nx + config.srcX;
      self.postMessage({ type: 'LOG',
        message: `Impedance tube — mics@y=${mic1Y},${mic2Y} · s=${(5*config.dx*100).toFixed(1)}cm` });
      runImpedanceTest();
    } else {
      loop();
    }
  }


  if (type === 'STOP') {
    isRunning = false;
  }
};

// ─── Impedance extraction (chunked, non-blocking) ────────────────────────────
function runImpedanceTest(): void {
  const CourantSq = ((config.c * config.dt) / config.dx) ** 2;
  const spread    = 0.005;   // Gaussian width (s)
  const t0        = 0.02;    // Gaussian peak time (s)
  const srcIdx    = config.srcY * gridNx + config.srcX;

  self.postMessage({ type: 'PROGRESS', progress: 0 });
  self.postMessage({ type: 'LOG', message: `Impulse — ${FFT_SIZE} steps · chunk=${CHUNK_SIZE}` });

  let s = 0;

  function processChunk(): void {
    if (!isRunning) {
      self.postMessage({ type: 'LOG', message: '■ Aborted.' });
      return;
    }

    const endS = Math.min(s + CHUNK_SIZE, FFT_SIZE);

    for (; s < endS; s++) {
      const t = s * config.dt;

      // Gaussian pressure impulse (broadband excitation)
      p0[srcIdx] += 10.0 * Math.exp(-(((t - t0) / spread) ** 2));

      stepFDTD(CourantSq);

      // Record mic signals from current pressure field
      p1_record[s] = p0[mic1_loc];
      p2_record[s] = p0[mic2_loc];

      // Advance buffers: t_{n+1}→t_n, t_n→t_{n-1}, old t_{n-1}→scratch
      const tmp = p1; p1 = p0; p0 = p2; p2 = tmp;
    }

    const progress = Math.floor((s / FFT_SIZE) * 90);
    self.postMessage({ type: 'PROGRESS', progress });
    if (s % (CHUNK_SIZE * 8) === 0 && s > 0)
      self.postMessage({ type: 'LOG', message: `FDTD  ${String(progress).padStart(3)}%` });

    if (s < FFT_SIZE) setTimeout(processChunk, 0);
    else               finishImpedanceTest();
  }

  processChunk();
}

function finishImpedanceTest(): void {
  self.postMessage({ type: 'PROGRESS', progress: 92 });
  self.postMessage({ type: 'LOG', message: 'FFT post-processing…' });

  const im1 = new Float64Array(FFT_SIZE);
  const im2 = new Float64Array(FFT_SIZE);
  fft(p1_record, im1);
  fft(p2_record, im2);

  const df      = 1.0 / (FFT_SIZE * config.dt);
  const s_dist  = 5  * config.dx;  // mic spacing (5 cells)
  const x1_dist = 30 * config.dx;  // mic2-to-sample distance (30 cells)
  const rho_c   = 413.0;           // specific acoustic impedance of air (Pa·s/m)

  const freqs: number[] = [];
  const mags:  number[] = [];
  const phases: number[] = [];

  for (let i = 1; i < FFT_SIZE / 2; i++) {
    const f = i * df;
    if (f > 2500) break;
    if (f < 50)   continue;

    freqs.push(f);

    // ISO 10534-2: two-mic transfer-function method
    const P1R = p1_record[i], P1I = im1[i];
    const P2R = p2_record[i], P2I = im2[i];
    const denom = P1R*P1R + P1I*P1I + 1e-30;
    const H12R  = (P2R*P1R + P2I*P1I) / denom;
    const H12I  = (P2I*P1R - P2R*P1I) / denom;

    const k  = 2 * Math.PI * f / config.c;
    const ck = Math.cos(k * s_dist), sk = Math.sin(k * s_dist);

    const Rn_r = H12R - ck,  Rn_i = H12I + sk;
    const Rd_r = ck - H12R,  Rd_i = -sk  - H12I;
    const rdm  = Rd_r*Rd_r + Rd_i*Rd_i + 1e-30;
    const Ri_r = (Rn_r*Rd_r + Rn_i*Rd_i) / rdm;
    const Ri_i = (Rn_i*Rd_r - Rn_r*Rd_i) / rdm;

    // Phase shift from mic2 to sample face
    const er = Math.cos(2*k*x1_dist), ei = Math.sin(2*k*x1_dist);
    const Rr  = Ri_r*er - Ri_i*ei;
    const Ri  = Ri_r*ei + Ri_i*er;

    // Z_norm = ρc·(1+R)/(1−R)
    const Zn_r = 1 + Rr,  Zn_i = Ri;
    const Zd_r = 1 - Rr,  Zd_i = -Ri;
    const zdm  = Zd_r*Zd_r + Zd_i*Zd_i + 1e-30;
    const Zr   = rho_c * (Zn_r*Zd_r + Zn_i*Zd_i) / zdm;
    const Zi   = rho_c * (Zn_i*Zd_r - Zn_r*Zd_i) / zdm;

    const mag = Math.sqrt(Zr*Zr + Zi*Zi);
    let   ph  = Math.atan2(Zi, Zr) * (180 / Math.PI);
    if (ph >  180) ph -= 360;
    if (ph < -180) ph += 360;

    mags.push(Math.max(1, mag));
    phases.push(ph);
  }

  self.postMessage({ type: 'PROGRESS', progress: 100 });
  self.postMessage({ type: 'LOG', message: `✓ ${freqs.length} bins · Δf=${df.toFixed(1)} Hz` });
  // @ts-ignore — Transferable message
  self.postMessage({ type: 'IMPEDANCE_RESULTS', freqs, mags, phases });
  isRunning = false;
}

// ─── Live FDTD visualisation loop ────────────────────────────────────────────
function loop(): void {
  if (!isRunning) return;
  const CourantSq = ((config.c * config.dt) / config.dx) ** 2;

  for (let s = 0; s < config.stepsPerFrame; s++) {
    const t      = stepCount * config.dt;
    const srcIdx = config.srcY * gridNx + config.srcX;

    if (config.mode === 'impulse') {
      const spread = 0.0015, t0 = 0.005;
      p0[srcIdx] += 1.5 * Math.exp(-(((t - t0) / spread) ** 2));
    } else {
      // Soft source: add sinusoidal excitation additively
      p0[srcIdx] += 0.5 * Math.sin(2 * Math.PI * config.freq * t);
    }

    stepFDTD(CourantSq);

    const tmp = p1; p1 = p0; p0 = p2; p2 = tmp;
    stepCount++;
  }

  const now = performance.now();
  if (now - lastPostTime > 16) {
    // Transfer a copy of the pressure field to the main thread
    const clone = new Float32Array(p0);
    // @ts-ignore
    self.postMessage({ type: 'RENDER', pressureMap: clone.buffer }, [clone.buffer]);
    lastPostTime = now;
  }

  setTimeout(loop, 0);
}
