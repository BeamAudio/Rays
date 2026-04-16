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
  srcY: 100,
  mode: 'impulse', // 'impulse' or 'cw'
  freq: 500,    // cw frequency
};

let stepCount = 0;
let lastPostTime = 0;

self.onmessage = (e) => {
  const { type } = e.data;
  
  if (type === 'INIT') {
    const { nx, ny, walls, sourceX, sourceY, simMode, frequency } = e.data.payload;
    gridNx = nx;
    gridNy = ny;
    p0 = new Float32Array(nx * ny);
    p1 = new Float32Array(nx * ny);
    p2 = new Float32Array(nx * ny);
    boundaryMap = walls; // Uint8Array length nx*ny
    
    config.srcX = Math.floor(sourceX);
    config.srcY = Math.floor(sourceY);
    config.mode = simMode || 'impulse';
    config.freq = frequency || 500;
    
    // Courant stability condition limit
    config.dt = config.dx / (config.c * Math.SQRT2); 
    stepCount = 0;
    isRunning = true;
    loop();
  }
  
  if (type === 'STOP') {
    isRunning = false;
  }
};

function loop() {
  if (!isRunning) return;
  
  // Step FDTD multiple times per visual frame
  const stepsPerFrame = 15; 
  
  const CourantSq = Math.pow((config.c * config.dt) / config.dx, 2);
  const { nx, ny } = { nx: gridNx, ny: gridNy };
  
  for (let s = 0; s < stepsPerFrame; s++) {
    // 1. Inject Source
    const t = stepCount * config.dt;
    const srcIdx = config.srcY * nx + config.srcX;
    
    if (config.mode === 'impulse') {
      const spread = 0.0015; 
      const t0 = 0.005;     
      p0[srcIdx] += 1.5 * Math.exp(-Math.pow((t - t0) / spread, 2));
    } else {
      p0[srcIdx] = Math.sin(2 * Math.PI * config.freq * t);
    }
    
    // 2. FDTD Core Loop (Interior Points)
    // p^{n+1} = 2*p^n - p^{n-1} + C^2 * dt^2/dx^2 * laplacian
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const idx = y * nx + x;
        
        // Reflective boundary condition (walls)
        if (boundaryMap[idx] === 1) {
          p2[idx] = 0; 
          continue;
        }
        
        const pC = p0[idx];
        const pL = p0[idx - 1];
        const pR = p0[idx + 1];
        const pU = p0[idx - nx];
        const pD = p0[idx + nx];
        
        const laplacian = pL + pR + pU + pD - 4 * pC;
        
        // Optional numerical tiny damping
        const damp = 0.0001; 
        p2[idx] = (2 * pC - p1[idx] + CourantSq * laplacian) / (1 + damp);
      }
    }
    
    // 3. Absorbing Boundary Conditions (ABC) First-Order Mur
    const C0 = (config.c * config.dt - config.dx) / (config.c * config.dt + config.dx);
    for (let x = 0; x < nx; x++) {
       // top
       p2[x] = p1[nx + x] + C0 * (p2[nx + x] - p0[x]);
       // bottom
       const bIdx = (ny - 1) * nx + x;
       const intIdx = (ny - 2) * nx + x;
       p2[bIdx] = p1[intIdx] + C0 * (p2[intIdx] - p0[bIdx]);
    }
    for (let y = 0; y < ny; y++) {
       // left
       const lIdx = y * nx;
       const intL = y * nx + 1;
       p2[lIdx] = p1[intL] + C0 * (p2[intL] - p0[lIdx]);
       // right
       const rIdx = y * nx + (nx - 1);
       const intR = y * nx + (nx - 2);
       p2[rIdx] = p1[intR] + C0 * (p2[intR] - p0[rIdx]);
    }

    // 4. Time step swap
    let temp = p1;
    p1 = p0;
    p0 = p2;
    p2 = temp;
    
    stepCount++;
  }
  
  // Post state back
  const now = performance.now();
  if (now - lastPostTime > 16) {
    const clone = new Float32Array(p0);
    // @ts-ignore
    self.postMessage({ type: 'RENDER', pressureMap: clone.buffer }, [clone.buffer]);
    lastPostTime = now;
  }
  
  setTimeout(loop, 0); 
}
