import * as THREE from 'three';
import { BVH } from './bvh';
import type { Ray } from './bvh';
import type { SceneObject, EnvironmentSettings } from '../types';

// Internal raytracer IR structure — energies and paths are always present
interface RayImpulseResponse {
  times: number[];
  orders: number[];
  energies: number[][];
  angles: [number, number][]; // [azimuth, elevation] in radians
  paths: { points: [number, number, number][], energy: number, time: number, order: number }[];
}

class ReceiverGrid {
  private grid: Map<string, string[]> = new Map();
  private cellSize: number = 2.0;

  constructor(receivers: SceneObject[]) {
    receivers.forEach(r => {
      const cell = this.getCell(new THREE.Vector3(...r.position));
      if (!this.grid.has(cell)) this.grid.set(cell, []);
      this.grid.get(cell)!.push(r.id);
    });
  }

  private getCell(pos: THREE.Vector3): string {
    const x = Math.floor(pos.x / this.cellSize);
    const y = Math.floor(pos.y / this.cellSize);
    const z = Math.floor(pos.z / this.cellSize);
    return `${x},${y},${z}`;
  }

  public getNearby(pos: THREE.Vector3): string[] {
    const result: string[] = [];
    const x = Math.floor(pos.x / this.cellSize);
    const y = Math.floor(pos.y / this.cellSize);
    const z = Math.floor(pos.z / this.cellSize);

    // Check 3x3x3 neighborhood
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cell = `${x + dx},${y + dy},${z + dz}`;
          const ids = this.grid.get(cell);
          if (ids) result.push(...ids);
        }
      }
    }
    return result;
  }
}

export class RayTracer {
  private bvh: BVH;
  private objects: Map<string, SceneObject>;
  private recGrid: ReceiverGrid | null = null;
  private numRays: number;
  private maxBounces: number;
  private totalPathsCollected: number = 0;
  private MAX_PATHS = 500;
  private airAbsorption: number[]; // dB/m per octave band
  private freqs = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];

  constructor(bvh: BVH, objects: SceneObject[], envSettings?: EnvironmentSettings) {
    this.bvh = bvh;
    this.objects = new Map(objects.map(o => [o.id, o]));
    
    // Use envSettings if available, else defaults
    this.numRays = envSettings?.rayCount || 25000;
    this.maxBounces = envSettings?.maxBounces || 30;
    
    const tC = envSettings?.temperature || 20;
    const rh = envSettings?.humidity || 50;
    const pa = envSettings?.pressure || 101.325;
    
    this.airAbsorption = this.calculateISO9613AirAbsorption(tC, rh, pa, this.freqs);
  }

  private calculateISO9613AirAbsorption(tempC: number, rh: number, pa_kPa: number, freqs: number[]): number[] {
    const T = tempC + 273.15;
    const T01 = 293.15;
    const pr = pa_kPa / 101.325; // pressure ratio to reference 1 atm
    
    // Calculate saturation vapor pressure ratio more accurately
    const psat = Math.pow(10, -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151); 
    const h = rh * (psat / pr); // Molar concentration of water vapor (%)
    
    // Relaxation frequencies for Oxygen and Nitrogen
    const frO = pr * (24 + 4.04e4 * h * (0.02 + h) / (0.391 + h));
    const frN = pr * Math.pow(T / T01, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T01, -1 / 3) - 1)));
    
    return freqs.map(f => {
      const alpha = 8.686 * f * f * (
        1.84e-11 / pr * Math.pow(T / T01, 0.5) +
        Math.pow(T / T01, -2.5) * (
          0.01275 * Math.exp(-2239.1 / T) * (frO / (frO * frO + f * f)) +
          0.1068 * Math.exp(-3352.0 / T) * (frN / (frN * frN + f * f))
        )
      );
      return alpha; // returns attenuation coefficient in dB/m
    });
  }
  public simulate(source: SceneObject, receivers: SceneObject[]): Map<string, RayImpulseResponse> {
    const results = new Map<string, RayImpulseResponse>();
    receivers.forEach(r => results.set(r.id, { times: [], orders: [], energies: [], angles: [], paths: [] }));
    
    this.recGrid = new ReceiverGrid(receivers);
    this.totalPathsCollected = 0;
    
    // Phase 1: High-Order Image Source Method (Deterministic)
    this.runRecursiveISM(source, receivers, results, 2); // Default to 2nd order for precision

    // Phase 2: Stochastic Ray Tracing (Late Reverb)
    const lateRays = Math.max(1000, Math.floor(this.numRays / 2));
    this.simulateBatch(source, receivers, results, 0, lateRays);

    return results;
  }

  public simulateBatch(
    source: SceneObject, 
    receivers: SceneObject[], 
    results: Map<string, RayImpulseResponse>,
    startIdx: number,
    count: number
  ) {
    if (!this.recGrid) this.recGrid = new ReceiverGrid(receivers);
    const origin = new THREE.Vector3(...source.position);
    const endIdx = Math.min(this.numRays, startIdx + count);

    for (let i = startIdx; i < endIdx; i++) {
        const direction = this.getRandomDirection(source);
        const weights = this.getDirectivityWeights(source, direction);
        if (weights.every(w => w < 0.0001)) continue;
        this.traceRay({ origin, direction }, results, weights);
    }
  }

  public runRecursiveISM(source: SceneObject, receivers: SceneObject[], results: Map<string, RayImpulseResponse>, maxOrder: number) {
    const sourcePos = new THREE.Vector3(...source.position);
    
    // Order 0: Direct Sound
    this.checkVisibilityAndRecord(source, sourcePos, receivers, results, [], 0);

    if (maxOrder < 1) return;

    // Extract reflecting planes
    const planes: { normal: THREE.Vector3, point: THREE.Vector3, obj: SceneObject }[] = [];
    const processedPlanes = new Set<string>();

    for (const obj of this.objects.values()) {
        if (!obj.triangles || obj.type === 'receiver' || obj.type === 'source') continue;
        for (let i = 0; i < obj.triangles.length; i += 9) {
            const v0 = new THREE.Vector3(obj.triangles[i], obj.triangles[i+1], obj.triangles[i+2]);
            const v1 = new THREE.Vector3(obj.triangles[i+3], obj.triangles[i+4], obj.triangles[i+5]);
            const v2 = new THREE.Vector3(obj.triangles[i+6], obj.triangles[i+7], obj.triangles[i+8]);
            const normal = new THREE.Vector3().crossVectors(v1.clone().sub(v0), v2.clone().sub(v0)).normalize();
            const d = v0.dot(normal);
            const hash = `${normal.x.toFixed(2)},${normal.y.toFixed(2)},${normal.z.toFixed(2)}_${d.toFixed(2)}`;
            if (processedPlanes.has(hash)) continue;
            processedPlanes.add(hash);
            planes.push({ normal, point: v0, obj });
        }
    }

    // Recursive ISM Trace
    const trace = (currentSourcePos: THREE.Vector3, order: number, usedPlanes: any[]) => {
        if (order >= maxOrder) return;

        planes.forEach(plane => {
            // Avoid reflecting back onto the same plane immediately
            if (usedPlanes.length > 0 && usedPlanes[usedPlanes.length - 1] === plane) return;

            // Mirror current source across this plane
            const distToPlane = new THREE.Vector3().subVectors(currentSourcePos, plane.point).dot(plane.normal);
            if (distToPlane <= 0) return; // Source is behind plane

            const imagePos = currentSourcePos.clone().sub(plane.normal.clone().multiplyScalar(2 * distToPlane));
            const newUsedPlanes = [...usedPlanes, plane];

            // Check visibility for this image source across all receivers
            this.checkVisibilityAndRecord(source, imagePos, receivers, results, newUsedPlanes, order + 1);

            // Recurse
            trace(imagePos, order + 1, newUsedPlanes);
        });
    };

    trace(sourcePos, 0, []);
  }

  private checkVisibilityAndRecord(source: SceneObject, imagePos: THREE.Vector3, receivers: SceneObject[], results: Map<string, RayImpulseResponse>, planes: any[], order: number) {
    receivers.forEach(receiver => {
        const recPos = new THREE.Vector3(...receiver.position);
        const totalDist = imagePos.distanceTo(recPos);
        const time = totalDist / 343.0;
        
        // Find the valid reflection points on the planes (Working backwards from receiver)
        const points: [number, number, number][] = [[source.position[0], source.position[1], source.position[2]]];
        let currentStart = recPos.clone();
        let currentTarget = imagePos.clone();
        const reflPoints: THREE.Vector3[] = [];

        for (let i = planes.length - 1; i >= 0; i--) {
            const plane = planes[i];
            const dir = new THREE.Vector3().subVectors(currentTarget, currentStart).normalize();
            const denom = dir.dot(plane.normal);
            if (Math.abs(denom) < 1e-6) return; // Parallel
            const t = new THREE.Vector3().subVectors(plane.point, currentStart).dot(plane.normal) / denom;
            if (t <= 0) return; // Behind
            const p = currentStart.clone().addScaledVector(dir, t);
            reflPoints.unshift(p);
            currentStart = p;
            // The "image source" for the next plane in the backward chain is the reflection of the PREVIOUS image source
            // Or more simply, we just use the points.
        }

        // Add reflection points to path
        reflPoints.forEach(p => points.push([p.x, p.y, p.z]));
        points.push([recPos.x, recPos.y, recPos.z]);

        // Visibility Check (Physical Path validation)
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = new THREE.Vector3(...points[i]);
            const p2 = new THREE.Vector3(...points[i+1]);
            const segmentDir = new THREE.Vector3().subVectors(p2, p1).normalize();
            const segmentDist = p1.distanceTo(p2);
            const hit = this.bvh.intersect({ origin: p1.clone().addScaledVector(segmentDir, 0.001), direction: segmentDir });
            if (hit && hit.t < segmentDist - 0.01) {
                // If it hit something other than the intended plane (or source/receiver geometry)
                return;
            }
        }

        // Energy Calculation
        const emissionDir = new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]), new THREE.Vector3(...points[0])).normalize();
        const energy = this.getDirectivityWeights(source, emissionDir);
        const attenuation = 1.0 / Math.max(1.0, totalDist * totalDist);
        
        for (let f = 0; f < 24; f++) {
            energy[f] *= attenuation;
            energy[f] *= Math.pow(10, -(this.airAbsorption[f] * totalDist) / 10);
            // Apply absorption for each plane
            planes.forEach(p => {
                energy[f] *= (1.0 - (p.obj.material?.absorption[f] || 0.1));
            });
        }

        const ir = results.get(receiver.id)!;
        ir.times.push(time);
        ir.orders.push(order);
        ir.energies.push([...energy]);
        
        // Calculate arrival angles relative to receiver
        const arrivalDir = new THREE.Vector3().subVectors(new THREE.Vector3(...points[points.length-2]), recPos).normalize();
        const azimuth = Math.atan2(arrivalDir.x, arrivalDir.z);
        const elevation = Math.asin(THREE.MathUtils.clamp(arrivalDir.y, -1, 1));
        ir.angles.push([azimuth, elevation]);
        
        // Store path ONLY for this specific hit receiver
        if (ir.paths.length < 100) {
            ir.paths.push({ points: [...points], energy: energy[13], time, order });
        }
    });
  }


  private traceRay(ray: Ray, results: Map<string, RayImpulseResponse>, initialWeights?: number[]) {
    let currentRay = { origin: ray.origin.clone(), direction: ray.direction.clone() };
    let energy = initialWeights ? [...initialWeights] : Array(24).fill(1); // Energy per band
    let totalDist = 0;
    const history: [number, number, number][] = [[ray.origin.x, ray.origin.y, ray.origin.z]];

    for (let bounce = 0; bounce < this.maxBounces; bounce++) {
      const hit = this.bvh.intersect(currentRay);
      if (!hit) break;

      const dist = hit.t;

      // Check for receiver proximity along the entire segment [origin -> hit.point]
      const nearbyIds = this.recGrid!.getNearby(currentRay.origin);
      if (hit.t > 2.0) { // If segment is long, check nearby targets at the destination too
          const destIds = this.recGrid!.getNearby(hit.point);
          destIds.forEach(id => { if (!nearbyIds.includes(id)) nearbyIds.push(id); });
      }

      nearbyIds.forEach(id => {
        const receiver = this.objects.get(id);
        if (!receiver) return;

        const recPos = new THREE.Vector3(...receiver.position);
        const ba = new THREE.Vector3().subVectors(recPos, currentRay.origin);
        const t = ba.dot(currentRay.direction); // projection distance along ray

        // If the receiver's projection falls within this physical segment
        if (t > 0 && t < dist) {
           const proj = currentRay.origin.clone().addScaledVector(currentRay.direction, t);
           const distToRay = recPos.distanceTo(proj);
           
           if (distToRay < 0.25) { // Standardized 25cm volumetric microphone
              const distToReceiver = totalDist + t;
              const timeToReceiver = distToReceiver / 343.0;
              const currentOrder = bounce + 1;
              
              const ir = results.get(receiver.id)!;
              ir.times.push(timeToReceiver);
              ir.orders.push(currentOrder);
              ir.energies.push([...energy]);

              // Arrival direction for stochastic ray is just the ray's current direction
              const azimuth = Math.atan2(currentRay.direction.x, currentRay.direction.z);
              const elevation = Math.asin(THREE.MathUtils.clamp(currentRay.direction.y, -1, 1));
              ir.angles.push([azimuth, elevation]);
              
              // Cap global path count to avoid memory bloat
              if (this.totalPathsCollected < this.MAX_PATHS && ir.paths.length < 50) {
                 ir.paths.push({
                   points: [...history, [recPos.x, recPos.y, recPos.z]],
                   energy: energy[13],
                   time: timeToReceiver,
                   order: currentOrder
                 });
                 this.totalPathsCollected++;
              }
           }
        }
      });

      // Now physically move the ray energy to the wall hit
      totalDist += dist;
      for (let f = 0; f < 24; f++) {
        energy[f] *= Math.pow(10, -(this.airAbsorption[f] * dist) / 10);
      }

      // Log wall hit point
      history.push([hit.point.x, hit.point.y, hit.point.z]);

      const obj = this.objects.get(hit.objectId);
      if (!obj || !obj.material) break;

      // Apply absorption
      for (let f = 0; f < 24; f++) {
        energy[f] *= (1.0 - obj.material.absorption[f]);
      }

      // Volumetric attenuation if applicable
      if (obj.material.density) {
        const atten = Math.pow(10, -(obj.material.density * dist) / 10);
        for (let f = 0; f < 24; f++) energy[f] *= atten;
      }

      // Reflection
      const isSpecular = Math.random() > (obj.material.scattering || 0.1);
      const nextDir = isSpecular 
        ? currentRay.direction.clone().reflect(hit.normal)
        : this.getRandomHemisphereDirection(hit.normal);

      currentRay.origin.copy(hit.point).addScaledVector(hit.normal, 0.001); // Offset to avoid self-intersection
      currentRay.direction.copy(nextDir);

      if (energy.every(e => e < 0.001)) break;
    }
  }

  private getDirectivityWeights(source: SceneObject, worldDir: THREE.Vector3): number[] {
    const weights = Array(24).fill(1);
    if (!source.directivity || source.directivity === 'omni') return weights;

    // Convert world direction to local coordinates
    // We assume orientation is Euler [x, y, z] in radians
    // Use the inverse rotation to bring world to local
    const invRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(source.rotation || [0, 0, 0]))).invert();
    const localDir = worldDir.clone().applyQuaternion(invRot);

    if (source.directivity === 'cardioid') {
      // theta is angle relative to forward (Z+)
      const theta = Math.acos(THREE.MathUtils.clamp(localDir.z, -1, 1));
      const atten = 0.5 * (1 + Math.cos(theta));
      return weights.map(w => w * atten);
    }

    if (source.directivity === 'custom' && source.directivityData) {
      const data = source.directivityData;
      // Spherical coords
      const theta = Math.acos(THREE.MathUtils.clamp(localDir.z, -1, 1)); // Polar (0..PI)
      const phi = Math.atan2(localDir.y, localDir.x); // Azimuth (-PI..PI)
      
      const vDeg = (theta * 180 / Math.PI); // 0..180
      const hDeg = (phi * 180 / Math.PI) + 180; // 0..360
      
      const vIdx = Math.min(data.vertical.length - 1, Math.floor(vDeg / 10));
      const hIdx = Math.min(data.horizontal.length - 1, Math.floor(hDeg / 10));
      const angleIdx = vIdx * data.horizontal.length + hIdx;

      for (let f = 0; f < 24; f++) {
        const db = data.attenuation[f][angleIdx] || 0;
        weights[f] *= Math.pow(10, db / 10);
      }
    }

    return weights;
  }

  private getRandomDirection(source?: SceneObject): THREE.Vector3 {
    let u = Math.random();
    let v = Math.random();
    let theta = u * 2.0 * Math.PI;
    let z = 2.0 * v - 1.0;
    let r = Math.sqrt(1.0 - z * z);
    
    let dir = new THREE.Vector3(
      r * Math.cos(theta),
      r * Math.sin(theta),
      z
    );

    if (source && source.sourceType === 'line') {
      dir.y *= 0.1;
      dir.normalize();
    }

    return dir;
  }

  private getRandomHemisphereDirection(normal: THREE.Vector3): THREE.Vector3 {
    // Lambertian (Cosine-Weighted) Sampling
    // theta = acos(sqrt(u1)), phi = 2*pi*u2
    const u1 = Math.random();
    const u2 = Math.random();
    
    const r = Math.sqrt(u1);
    const theta = u2 * Math.PI * 2;
    
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const z = Math.sqrt(1 - u1);
    
    // Create a local orthonormal basis (tangent, bitangent, normal)
    const tangent = new THREE.Vector3();
    const bitangent = new THREE.Vector3();
    
    if (Math.abs(normal.x) > 0.1) {
      tangent.set(0, 1, 0).cross(normal).normalize();
    } else {
      tangent.set(1, 0, 0).cross(normal).normalize();
    }
    bitangent.copy(normal).cross(tangent);
    
    // Transform local vector to world space
    return tangent.multiplyScalar(x)
      .add(bitangent.multiplyScalar(y))
      .add(normal.clone().multiplyScalar(z))
      .normalize();
  }
}
