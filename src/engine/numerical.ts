import type { SceneObject, NumericalImpulseResponse } from '../types';

export class FDTDSolver {
  private dx: number = 0.2; // 20cm voxel resolution
  private c: number = 343.0;
  private dt: number;
  private steps: number;
  private objects: SceneObject[];
  private duration: number;
  
  constructor(objects: SceneObject[], duration: number = 0.3) {
    this.objects = objects;
    this.duration = duration;
    // Courant–Friedrichs–Lewy (CFL) stability condition for 3D
    this.dt = this.dx / (this.c * Math.sqrt(3));
    this.steps = Math.ceil(this.duration / this.dt);
  }

  public simulate(sources: SceneObject[], receivers: SceneObject[], onProgress?: (pct: number) => void): Map<string, NumericalImpulseResponse> {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    const meshes = this.objects.filter(o => o.type === 'mesh' || o.shape === 'box');
    if (meshes.length === 0) return new Map();

    meshes.forEach(m => {
      minX = Math.min(minX, m.position[0] - m.scale[0]/2);
      minY = Math.min(minY, m.position[1] - m.scale[1]/2);
      minZ = Math.min(minZ, m.position[2] - m.scale[2]/2);
      maxX = Math.max(maxX, m.position[0] + m.scale[0]/2);
      maxY = Math.max(maxY, m.position[1] + m.scale[1]/2);
      maxZ = Math.max(maxZ, m.position[2] + m.scale[2]/2);
    });

    // Add padding boundary
    minX -= this.dx * 3; minY -= this.dx * 3; minZ -= this.dx * 3;
    maxX += this.dx * 3; maxY += this.dx * 3; maxZ += this.dx * 3;

    const nx = Math.ceil((maxX - minX) / this.dx);
    const ny = Math.ceil((maxY - minY) / this.dx);
    const nz = Math.ceil((maxZ - minZ) / this.dx);
    
    const totalCells = nx * ny * nz;
    let p0 = new Float32Array(totalCells);
    let p1 = new Float32Array(totalCells);
    let p2 = new Float32Array(totalCells);

    // 1 = Air, 0 = Rigid Boundary
    const airMap = new Uint8Array(totalCells);
    airMap.fill(1);
    
    // Voxelize the geometry
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) {
        for (let z = 0; z < nz; z++) {
          const wx = minX + x * this.dx;
          const wy = minY + y * this.dx;
          const wz = minZ + z * this.dx;
          
          let isWall = false;
          for (const m of meshes) {
            // Basic AABB inclusion test for voxelization
            if (wx >= m.position[0] - m.scale[0]/2 && wx <= m.position[0] + m.scale[0]/2 &&
                wy >= m.position[1] - m.scale[1]/2 && wy <= m.position[1] + m.scale[1]/2 &&
                wz >= m.position[2] - m.scale[2]/2 && wz <= m.position[2] + m.scale[2]/2) {
              isWall = true;
              break;
            }
          }
          if (isWall) {
            airMap[x * ny * nz + y * nz + z] = 0;
          }
        }
      }
    }

    const getIndex = (x: number, y: number, z: number) => x * ny * nz + y * nz + z;

    const recIndices = receivers.map(r => {
      const x = Math.max(0, Math.min(nx - 1, Math.floor((r.position[0] - minX) / this.dx)));
      const y = Math.max(0, Math.min(ny - 1, Math.floor((r.position[1] - minY) / this.dx)));
      const z = Math.max(0, Math.min(nz - 1, Math.floor((r.position[2] - minZ) / this.dx)));
      return { id: r.id, idx: getIndex(x, y, z) };
    });

    const srcIndices = sources.map(s => {
      const x = Math.floor((s.position[0] - minX) / this.dx);
      const y = Math.floor((s.position[1] - minY) / this.dx);
      const z = Math.floor((s.position[2] - minZ) / this.dx);
      return getIndex(x, y, z);
    });

    const results = new Map<string, NumericalImpulseResponse>();
    receivers.forEach(r => results.set(r.id, { times: [], pressures: [], paths: [] }));

    const coeff = (this.c * this.dt / this.dx) * (this.c * this.dt / this.dx);

    // FDTD Main Time Loop
    for (let step = 0; step < this.steps; step++) {
      const time = step * this.dt;

      if (step % 50 === 0 && onProgress) {
        onProgress(Math.round((step / this.steps) * 100));
      }

      // Inject source (Gaussian pulse)
      const pulse = Math.exp(-Math.pow((step - 15) / 5, 2)); 
      for (const sIdx of srcIndices) {
        if (sIdx >= 0 && sIdx < totalCells) {
          p1[sIdx] += pulse;
        }
      }

      for (let x = 1; x < nx - 1; x++) {
        for (let y = 1; y < ny - 1; y++) {
          for (let z = 1; z < nz - 1; z++) {
            const idx = getIndex(x, y, z);
            if (airMap[idx] === 0) continue; // Boundary

            const p_left = p1[idx - ny * nz];
            const p_right = p1[idx + ny * nz];
            const p_down = p1[idx - nz];
            const p_up = p1[idx + nz];
            const p_back = p1[idx - 1];
            const p_front = p1[idx + 1];
            const p_center = p1[idx];

            const laplacian = p_left + p_right + p_down + p_up + p_back + p_front - 6 * p_center;
            p2[idx] = 2 * p_center - p0[idx] + coeff * laplacian;
            p2[idx] *= 0.9995; 
          }
        }
      }

      recIndices.forEach(r => {
        if (r.idx >= 0 && r.idx < totalCells) {
          const res = results.get(r.id)!;
          res.times.push(time);
          res.pressures.push(p2[r.idx]);
        }
      });

      const temp = p0;
      p0 = p1;
      p1 = p2;
      p2 = temp;
    }

    return results;
  }
}
