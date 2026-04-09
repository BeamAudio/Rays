import * as THREE from 'three';
import { BVH } from './bvh';
import type { Ray } from './bvh';
import type { SceneObject, EnvironmentSettings } from '../types';

// Internal raytracer IR structure — energies and paths are always present
interface RayImpulseResponse {
  times: number[];
  energies: number[][];
  paths: { points: [number, number, number][], energy: number, time: number }[];
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
    receivers.forEach(r => results.set(r.id, { times: [], energies: [], paths: [] }));
    
    this.recGrid = new ReceiverGrid(receivers);
    this.totalPathsCollected = 0;
    
    // Phase 1: Image Source Method (Direct + 1st Order)
    this.runISM(source, receivers, results);

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

  public runISM(source: SceneObject, receivers: SceneObject[], results: Map<string, RayImpulseResponse>) {
    const sourcePos = new THREE.Vector3(...source.position);
    // Direct Sound (0th Order)
    receivers.forEach(receiver => {
      const recPos = new THREE.Vector3(...receiver.position);
      const dist = sourcePos.distanceTo(recPos);
      const dir = new THREE.Vector3().subVectors(recPos, sourcePos).normalize();
      
      // Raycast to check visibility (Line of Sight)
      const hit = this.bvh.intersect({ origin: sourcePos, direction: dir });
      
      if (!hit || hit.t >= dist - 0.01) {
        // Visible!
        const time = dist / 343.0;
        const energy = this.getDirectivityWeights(source, dir);
        
        // 1/r^2 law
        const attenuation = 1.0 / Math.max(1.0, dist * dist);
        for (let f = 0; f < 24; f++) {
          energy[f] *= attenuation;
          // Air absorption
          energy[f] *= Math.pow(10, -(this.airAbsorption[f] * dist) / 10);
        }

        const ir = results.get(receiver.id)!;
        ir.times.push(time);
        ir.energies.push([...energy]);
        
        // Always store direct paths if under limit
        if (ir.paths.length < 300) {
          ir.paths.push({
            points: [[sourcePos.x, sourcePos.y, sourcePos.z], [recPos.x, recPos.y, recPos.z]],
            energy: energy[3],
            time: time
          });
        }
      }
    });

    // 1st Order ISM (Simplified for box walls)
    // We iterate over the BVH triangles, create an image source, and check visibility
    // For performance in JS, we only mirror across large planes (heuristic: triangles > 1m^2)
    const processedPlanes = new Set<string>(); // to avoid duplicate mirror planes
    
    // Extract unique planes from objects
    for (const obj of this.objects.values()) {
      if (!obj.triangles) continue;
      
      const v0 = new THREE.Vector3();
      const v1 = new THREE.Vector3();
      const v2 = new THREE.Vector3();
      const edge1 = new THREE.Vector3();
      const edge2 = new THREE.Vector3();
      
      // Calculate plane eq for each triangle
      for (let i = 0; i < obj.triangles.length; i += 9) {
          v0.set(obj.triangles[i], obj.triangles[i+1], obj.triangles[i+2]);
          v1.set(obj.triangles[i+3], obj.triangles[i+4], obj.triangles[i+5]);
          v2.set(obj.triangles[i+6], obj.triangles[i+7], obj.triangles[i+8]);
          
          edge1.subVectors(v1, v0);
          edge2.subVectors(v2, v0);
          
          const worldNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
          if (worldNormal.lengthSq() < 0.1) continue; // degenerate triangle
          
          // distance from origin to plane is dot(worldPoint, normal).
          // We can just use v0 as our point on the plane (already in world space from room_generator).
          const planeHash = `${worldNormal.x.toFixed(2)},${worldNormal.y.toFixed(2)},${worldNormal.z.toFixed(2)}_${v0.dot(worldNormal).toFixed(2)}`;
          if (processedPlanes.has(planeHash)) continue;
          processedPlanes.add(planeHash);
          
          // Mirror source
          const d = new THREE.Vector3().subVectors(sourcePos, v0).dot(worldNormal);
          const imagePos = sourcePos.clone().sub(worldNormal.clone().multiplyScalar(2 * d));

          receivers.forEach(receiver => {
              const recPos = new THREE.Vector3(...receiver.position);
              
              // Ray from image source to receiver
              const imageDir = new THREE.Vector3().subVectors(recPos, imagePos).normalize();
              const imageDist = imagePos.distanceTo(recPos);
              
              // Find intersection with the mirror plane
              const tPlane = new THREE.Vector3().subVectors(v0, imagePos).dot(worldNormal) / imageDir.dot(worldNormal);
              if (tPlane > 0 && tPlane < imageDist) {
                const reflectPoint = imagePos.clone().addScaledVector(imageDir, tPlane);
                
                // Visibility check 1: Source to Reflect Point
                const hit1 = this.bvh.intersect({ origin: sourcePos, direction: new THREE.Vector3().subVectors(reflectPoint, sourcePos).normalize() });
                // Visibility check 2: Reflect Point to Receiver
                const hit2 = this.bvh.intersect({ origin: reflectPoint.clone().addScaledVector(worldNormal, 0.001), direction: new THREE.Vector3().subVectors(recPos, reflectPoint).normalize() });
                
                // If the only thing we hit is the reflecting wall, or nothing blocks the path
                const valid1 = !hit1 || hit1.t >= sourcePos.distanceTo(reflectPoint) - 0.01;
                const valid2 = !hit2 || hit2.t >= reflectPoint.distanceTo(recPos) - 0.01;

                if (valid1 && valid2) {
                  const totalDist = sourcePos.distanceTo(reflectPoint) + reflectPoint.distanceTo(recPos);
                  const time = totalDist / 343.0;
                  
                  // Initial energy based on directivity at emission angle
                  const dirToPoint = new THREE.Vector3().subVectors(reflectPoint, sourcePos).normalize();
                  const energy = this.getDirectivityWeights(source, dirToPoint);
                  
                  const attenuation = 1.0 / Math.max(1.0, totalDist * totalDist);
                  for (let f = 0; f < 24; f++) {
                    energy[f] *= attenuation;
                    energy[f] *= (1.0 - (obj.material?.absorption[f] || 0.1));
                    energy[f] *= Math.pow(10, -(this.airAbsorption[f] * totalDist) / 10);
                  }

                  const ir = results.get(receiver.id)!;
                  ir.times.push(time);
                  ir.energies.push([...energy]);
                  
                  if (ir.paths.length < 300) {
                    ir.paths.push({
                      points: [
                        [sourcePos.x, sourcePos.y, sourcePos.z], 
                        [reflectPoint.x, reflectPoint.y, reflectPoint.z],
                        [recPos.x, recPos.y, recPos.z]
                      ],
                      energy: energy[3],
                      time: time
                    });
                  }
                }
              }
          });
      }
    }
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

      // Check for receiver proximity using spatial grid
      const nearbyIds = this.recGrid!.getNearby(currentRay.origin);
      nearbyIds.forEach(id => {
        const receiver = this.objects.get(id);
        if (!receiver) return;

        const recPos = new THREE.Vector3(...receiver.position);
        const pa = new THREE.Vector3().subVectors(recPos, currentRay.origin);
        const t = pa.dot(currentRay.direction); // projection distance along ray

        // If the receiver's projection falls within this physical segment
        if (t > 0 && t < dist) {
           const proj = currentRay.origin.clone().addScaledVector(currentRay.direction, t);
           const distToRay = recPos.distanceTo(proj);
           
           if (distToRay < 0.4) { // 40cm volumetric microphone
              const distToReceiver = totalDist + t;
              const timeToReceiver = distToReceiver / 343.0;
              
              const ir = results.get(receiver.id)!;
              ir.times.push(timeToReceiver);
              ir.energies.push([...energy]);
              
              // Cap global path count to avoid memory bloat
              if (this.totalPathsCollected < this.MAX_PATHS && ir.paths.length < 50) {
                 ir.paths.push({
                   points: [...history, [recPos.x, recPos.y, recPos.z]],
                   energy: energy[3],
                   time: timeToReceiver
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
