import { fft } from './fft';

// FDTD Acoustic Engine (Web Worker)
// Second-order 2D scalar wave equation solver

let p0: Float32Array; // p(t)
let p1: Float32Array; // p(t-1)
let p2: Float32Array; // p(t+1)
let boundaryMap: Uint8Array;
let gridNx = 200;
let gridNy = 200;

let isRunning = false;
let config = {
  dx: 0.02,     // 2cm spatial resolution
  c: 343,       // speed of sound
  dt: 0,
  srcX: 100,
  srcY: 190,    // Hardcoded near bottom for tube
  mode: 'impulse', // 'impulse', 'cw', or 'impedance'
  freq: 500,    // cw frequency
};

let stepCount = 0;
let lastPostTime = 0;

// Impedance measurement arrays (pow 2 padding for FFT)
const FFT_SIZE = 8192; 
let p1_record = new Float64Array(FFT_SIZE);
let p2_record = new Float64Array(FFT_SIZE);
let mic1_loc = 0;
let mic2_loc = 0;

self.onmessage = (e) => {
  const { type } = e.data;
  
  if (type === 'INIT') {
    const { nx, ny, walls, sourceX, sourceY, simMode, frequency } = e.data.payload;
    gridNx = nx;
    gridNy = ny;
    p0 = new Float32Array(nx * ny);
    p1 = new Float32Array(nx * ny);
    p2 = new Float32Array(nx * ny);
    boundaryMap = walls;
    
    config.srcX = Math.floor(sourceX);
    config.srcY = Math.floor(sourceY);
    config.mode = simMode || 'impulse';
    config.freq = frequency || 500;
    
    config.dt = config.dx / (config.c * Math.SQRT2); 
    stepCount = 0;
    isRunning = true;

    if (config.mode === 'impedance') {
       // Setup Impedance Tube: Source at bottom (190), sample assumed at center (100)
       // Mics placed between source and sample
       const mic1Y = 135; 
       const mic2Y = 130;  // 10cm spacing (5 cells * 0.02)
       mic1_loc = mic1Y * nx + config.srcX;
       mic2_loc = mic2Y * nx + config.srcX;
       
       // Force a broad impulse
       config.mode = 'impulse';
       
       // Run silently and synchronously
       runImpedanceTest();
    } else {
       loop();
    }
  }
  
  if (type === 'STOP') {
    isRunning = false;
  }
};

function runImpedanceTest() {
  const CourantSq = Math.pow((config.c * config.dt) / config.dx, 2);
  const { nx, ny } = { nx: gridNx, ny: gridNy };
  const C0 = (config.c * config.dt - config.dx) / (config.c * config.dt + config.dx);
  
  // Spread Gaussian for low frequency content
  const spread = 0.005; 
  const t0 = 0.02;

  self.postMessage({ type: 'PROGRESS', progress: 0 });

  for (let s = 0; s < FFT_SIZE; s++) {
    const t = s * config.dt;
    const srcIdx = config.srcY * nx + config.srcX;
    
    // Inject impulse
    p0[srcIdx] += 10.0 * Math.exp(-Math.pow((t - t0) / spread, 2));

    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const idx = y * nx + x;
        if (boundaryMap[idx] === 1) {
          p2[idx] = 0; 
          continue;
        }
        const laplacian = p0[idx - 1] + p0[idx + 1] + p0[idx - nx] + p0[idx + nx] - 4 * p0[idx];
        p2[idx] = 2 * p0[idx] - p1[idx] + CourantSq * laplacian;
      }
    }
    
    // simple ABC bounds (only top and sides, bottom is reflective pipe)
    for (let x = 0; x < nx; x++) p2[x] = p1[nx + x] + C0 * (p2[nx + x] - p0[x]);
    for (let y = 0; y < ny; y++) {
       p2[y * nx] = p1[y * nx + 1] + C0 * (p2[y * nx + 1] - p0[y * nx]);
       p2[y * nx + (nx - 1)] = p1[y * nx + (nx - 2)] + C0 * (p2[y * nx + (nx - 2)] - p0[y * nx + (nx - 1)]);
    }

    // Record mics
    p1_record[s] = p0[mic1_loc];
    p2_record[s] = p0[mic2_loc];

    // Swap
    let temp = p1; p1 = p0; p0 = p2; p2 = temp;

    if (s % 1000 === 0) {
       self.postMessage({ type: 'PROGRESS', progress: Math.floor((s/FFT_SIZE)*90) });
    }
  }

  // Perform FFT
  self.postMessage({ type: 'PROGRESS', progress: 95 });
  
  const im1 = new Float64Array(FFT_SIZE);
  const im2 = new Float64Array(FFT_SIZE);
  
  fft(p1_record, im1);
  fft(p2_record, im2);

  const df = 1.0 / (FFT_SIZE * config.dt);
  
  // Calculate Z(f)
  const freqs = [];
  const mags = [];
  const phases = [];
  
  const s_dist = 5 * config.dx; // 0.1m
  const x1_dist = 30 * config.dx; // Mic 2 is 0.6m from center sample (100)
  const rho_c = 413.0; // Specific acoustic impedance of air

  for (let i = 1; i < FFT_SIZE / 2; i++) {
     const f = i * df;
     if (f > 2500) break; // Valid upper limit for 10cm spacing
     
     if (f >= 50) { // start at 50Hz to avoid DC numerical blowups
        freqs.push(f);
        
        const P1R = p1_record[i]; const P1I = im1[i];
        const P2R = p2_record[i]; const P2I = im2[i];
        
        // H12 = P2 / P1  (Complex division)
        const denom = P1R*P1R + P1I*P1I;
        const H12R = (P2R * P1R + P2I * P1I) / denom;
        const H12I = (P2I * P1R - P2R * P1I) / denom;
        
        const k = 2 * Math.PI * f / config.c;
        const exp_jks_r = Math.cos(k * s_dist);
        const exp_m_jks_r = Math.cos(-k * s_dist);
        const exp_jks_i = Math.sin(k * s_dist);
        const exp_m_jks_i = Math.sin(-k * s_dist);
        
        // R numerator: H12 - exp(-jks)
        const R_num_r = H12R - exp_m_jks_r;
        const R_num_i = H12I - exp_m_jks_i;
        
        // R denominator: exp(jks) - H12
        const R_den_r = exp_jks_r - H12R;
        const R_den_i = exp_jks_i - H12I;
        
        // Complex division for R_intermediate
        const r_den_mag = R_den_r*R_den_r + R_den_i*R_den_i;
        const R_int_r = (R_num_r * R_den_r + R_num_i * R_den_i) / r_den_mag;
        const R_int_i = (R_num_i * R_den_r - R_num_r * R_den_i) / r_den_mag;
        
        // R = R_int * exp(j2kx1)
        const exp_j2kx1_r = Math.cos(2 * k * x1_dist);
        const exp_j2kx1_i = Math.sin(2 * k * x1_dist);
        
        const Rr = R_int_r * exp_j2kx1_r - R_int_i * exp_j2kx1_i;
        const Ri = R_int_r * exp_j2kx1_i + R_int_i * exp_j2kx1_r;
        
        // Z = rho_c * (1+R)/(1-R)
        const Z_num_r = 1 + Rr;
        const Z_num_i = Ri;
        const Z_den_r = 1 - Rr;
        const Z_den_i = -Ri;
        
        const z_den_mag = Z_den_r*Z_den_r + Z_den_i*Z_den_i;
        const Zr = rho_c * (Z_num_r * Z_den_r + Z_num_i * Z_den_i) / z_den_mag;
        const Zi = rho_c * (Z_num_i * Z_den_r - Z_num_r * Z_den_i) / z_den_mag;
        
        const magnitude = Math.sqrt(Zr*Zr + Zi*Zi);
        let phase = Math.atan2(Zi, Zr) * (180 / Math.PI);
        
        // Clean up phase wrapping for Bode
        if (phase > 180) phase -= 360;
        if (phase < -180) phase += 360;

        mags.push(Math.max(1, magnitude));
        phases.push(phase);
     }
  }

  // @ts-ignore
  self.postMessage({ type: 'IMPEDANCE_RESULTS', freqs, mags, phases });
  isRunning = false;
}

function loop() {
  if (!isRunning) return;
  
  const stepsPerFrame = 15; 
  const CourantSq = Math.pow((config.c * config.dt) / config.dx, 2);
  const { nx, ny } = { nx: gridNx, ny: gridNy };
  const C0 = (config.c * config.dt - config.dx) / (config.c * config.dt + config.dx);
  
  for (let s = 0; s < stepsPerFrame; s++) {
    const t = stepCount * config.dt;
    const srcIdx = config.srcY * nx + config.srcX;
    
    if (config.mode === 'impulse') {
      const spread = 0.0015; 
      const t0 = 0.005;     
      p0[srcIdx] += 1.5 * Math.exp(-Math.pow((t - t0) / spread, 2));
    } else {
      p0[srcIdx] = Math.sin(2 * Math.PI * config.freq * t);
    }
    
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const idx = y * nx + x;
        if (boundaryMap[idx] === 1) {
          p2[idx] = 0; 
          continue;
        }
        const laplacian = p0[idx - 1] + p0[idx + 1] + p0[idx - nx] + p0[idx + nx] - 4 * p0[idx];
        p2[idx] = (2 * p0[idx] - p1[idx] + CourantSq * laplacian) / 1.0001;
      }
    }
    
    for (let x = 0; x < nx; x++) {
       p2[x] = p1[nx + x] + C0 * (p2[nx + x] - p0[x]);
       p2[(ny - 1) * nx + x] = p1[(ny - 2) * nx + x] + C0 * (p2[(ny - 2) * nx + x] - p0[(ny - 1) * nx + x]);
    }
    for (let y = 0; y < ny; y++) {
       p2[y * nx] = p1[y * nx + 1] + C0 * (p2[y * nx + 1] - p0[y * nx]);
       p2[y * nx + (nx - 1)] = p1[y * nx + (nx - 2)] + C0 * (p2[y * nx + (nx - 2)] - p0[y * nx + (nx - 1)]);
    }

    let temp = p1; p1 = p0; p0 = p2; p2 = temp;
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
