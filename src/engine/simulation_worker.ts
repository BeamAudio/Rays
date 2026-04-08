import { calculateMetrics } from './metrics';
import { RayTracer } from './raytracer';
import { BVH } from './bvh';
import type { SceneObject } from '../state/project_state';

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

    self.postMessage({ type: 'PROGRESS', progress: 50 }); // Simulate might block worker, progress is manual for now
    
    // We simulate using the first source for now (or could aggregate all if RayTracer supported it)
    const resultsMap = tracer.simulate(sources[0], receivers);

    self.postMessage({ type: 'PROGRESS', progress: 95 });

    const results: any[] = [];
    const rawIRs: any = {};
    resultsMap.forEach((ir, recId) => {
       const metrics = calculateMetrics({
          times: ir.times,
          energies: ir.energies
       });
       results.push({
          receiverId: recId,
          metrics,
          rayPaths: ir.paths
       });
       rawIRs[recId] = ir;
    });

    self.postMessage({ type: 'DONE', results, rawIRs });
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', error: err.message });
  }
};
