import { calculateMetrics } from './metrics';
import { RayTracer } from './raytracer';
import { BVH } from './bvh';
import type { SceneObject } from '../types';

self.onmessage = (e: MessageEvent) => {
  const { objects, sources, receivers, environmentSettings } = e.data;

  try {
    // 1. Compile Geometry for BVH
    const meshes = objects.filter((o: SceneObject) => o.triangles && o.triangles.length > 0);
    let totalTriangles = 0;
    meshes.forEach((m: SceneObject) => {
      totalTriangles += m.triangles!.length / 9;
    });

    const combinedTriangles = new Float32Array(totalTriangles * 9);
    const objectIds: string[] = [];
    
    let offset = 0;
    meshes.forEach((m: SceneObject) => {
      combinedTriangles.set(m.triangles!, offset);
      const numTris = m.triangles!.length / 9;
      for (let i = 0; i < numTris; i++) {
        objectIds.push(m.id);
      }
      offset += m.triangles!.length;
    });

    const bvh = new BVH(combinedTriangles, objectIds);

    // 2. Initialize RayTracer
    const tracer = new RayTracer(bvh, objects, environmentSettings);

    const resultsMap = new Map();
    receivers.forEach((r: SceneObject) => resultsMap.set(r.id, { times: [], orders: [], energies: [], angles: [], paths: [] }));

    // Phase 1: High-Order Deterministic ISM
    sources.forEach((s: SceneObject, idx: number) => {
      tracer.runRecursiveISM(s, receivers, resultsMap, environmentSettings?.ismOrder || 2);
      const progress = Math.floor(((idx + 1) / sources.length) * 10);
      self.postMessage({ type: 'PROGRESS', progress });
    });

    // Phase 2: Batched Stochastic Ray Tracing
    const lateRays = Math.max(1000, Math.floor((environmentSettings?.rayCount || 25000) / 2));
    const BATCH_SIZE = 2500;
    
    for (let i = 0; i < lateRays; i += BATCH_SIZE) {
      sources.forEach((s: SceneObject) => {
        tracer.simulateBatch(s, receivers, resultsMap, i, BATCH_SIZE, lateRays);
      });
      const progress = 10 + Math.floor((i / lateRays) * 85);
      self.postMessage({ type: 'PROGRESS', progress });
    }

    self.postMessage({ type: 'PROGRESS', progress: 98 });

    // 3. Process & Sanitise Results
    const results: any[] = [];
    const rawIRs: any = {};
    
    // Primary receivers are those that aren't grid points (identified by lack of underscore in ID)
    resultsMap.forEach((ir, recId) => {
       const metrics = calculateMetrics({
          times: ir.times,
          energies: ir.energies,
          orders: ir.orders
       });

       const isGridPoint = recId.includes('_');
       const isVolumetric = recId.startsWith('v_');

       if (isVolumetric) {
         results.push({
           receiverId: recId,
           position: (receivers.find((r: any) => r.id === recId) as SceneObject).position,
           metrics
         });
       } else {
         results.push({
            receiverId: recId,
            metrics,
            // Only send rayPaths for non-grid points to keep UI clean
            rayPaths: isGridPoint ? [] : ir.paths
         });
       }

       // ONLY send raw impulse response for primary receivers (for auralization)
       // This is the main "crash preventer" for large grids
       if (!isGridPoint && !isVolumetric) {
          rawIRs[recId] = ir;
       }
    });

    self.postMessage({ type: 'DONE', results, rawIRs });
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', error: err.message });
  }
};
