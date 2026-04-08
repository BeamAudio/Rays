import * as THREE from 'three';

export interface Ray {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  invDir?: THREE.Vector3; // Optimization
}

export interface Intersection {
  t: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  objectId: string;
}

class AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;

  constructor() {
    this.min = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  }

  expandByPoint(p: THREE.Vector3) {
    this.min.min(p);
    this.max.max(p);
  }

  intersect(ray: Ray): boolean {
    const invD = ray.invDir!;
    let tmin = (this.min.x - ray.origin.x) * invD.x;
    let tmax = (this.max.x - ray.origin.x) * invD.x;
    if (tmin > tmax) { const temp = tmin; tmin = tmax; tmax = temp; }

    let tymin = (this.min.y - ray.origin.y) * invD.y;
    let tymax = (this.max.y - ray.origin.y) * invD.y;
    if (tymin > tymax) { const temp = tymin; tymin = tymax; tymax = temp; }

    if ((tmin > tymax) || (tymin > tmax)) return false;
    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;

    let tzmin = (this.min.z - ray.origin.z) * invD.z;
    let tzmax = (this.max.z - ray.origin.z) * invD.z;
    if (tzmin > tzmax) { const temp = tzmin; tzmin = tzmax; tzmax = temp; }

    if ((tmin > tzmax) || (tzmin > tmax)) return false;
    if (tzmin > tmin) tmin = tzmin;
    if (tzmax < tmax) tmax = tzmax;

    return tmax > 0;
  }
}

class BVHNode {
  bounds: AABB;
  left: BVHNode | null = null;
  right: BVHNode | null = null;
  triangleIndices: number[] = [];

  constructor() {
    this.bounds = new AABB();
  }
}

export class BVH {
  private triangles: Float32Array;
  private objectIds: string[];
  private root: BVHNode | null = null;

  constructor(triangles: Float32Array, objectIds: string[]) {
    this.triangles = triangles;
    this.objectIds = objectIds;
    this.build();
  }

  private build() {
    const numTriangles = this.triangles.length / 9;
    if (numTriangles === 0) return;

    const indices = new Array(numTriangles);
    for (let i = 0; i < numTriangles; i++) indices[i] = i;

    this.root = this.buildRecursive(indices, 0);
  }

  private getTriangleBounds(index: number): AABB {
    const bounds = new AABB();
    const idx = index * 9;
    bounds.expandByPoint(new THREE.Vector3(this.triangles[idx], this.triangles[idx+1], this.triangles[idx+2]));
    bounds.expandByPoint(new THREE.Vector3(this.triangles[idx+3], this.triangles[idx+4], this.triangles[idx+5]));
    bounds.expandByPoint(new THREE.Vector3(this.triangles[idx+6], this.triangles[idx+7], this.triangles[idx+8]));
    return bounds;
  }

  private getTriangleCentroid(index: number): THREE.Vector3 {
    const idx = index * 9;
    return new THREE.Vector3(
      (this.triangles[idx] + this.triangles[idx+3] + this.triangles[idx+6]) / 3,
      (this.triangles[idx+1] + this.triangles[idx+4] + this.triangles[idx+7]) / 3,
      (this.triangles[idx+2] + this.triangles[idx+5] + this.triangles[idx+8]) / 3
    );
  }

  private buildRecursive(indices: number[], depth: number): BVHNode {
    const node = new BVHNode();
    
    // Compute bounds for all triangles in this node
    let centroidBounds = new AABB();
    for (const i of indices) {
      const triBounds = this.getTriangleBounds(i);
      node.bounds.expandByPoint(triBounds.min);
      node.bounds.expandByPoint(triBounds.max);
      centroidBounds.expandByPoint(this.getTriangleCentroid(i));
    }

    if (indices.length <= 4 || depth > 20) {
      node.triangleIndices = indices;
      return node;
    }

    // Find largest axis to split
    const extents = new THREE.Vector3().subVectors(centroidBounds.max, centroidBounds.min);
    let splitAxis = 0; // 0=x, 1=y, 2=z
    if (extents.y > extents.x) splitAxis = 1;
    if (extents.z > (splitAxis === 0 ? extents.x : extents.y)) splitAxis = 2;

    // Use midpoint split
    const splitPoint = centroidBounds.min.getComponent(splitAxis) + extents.getComponent(splitAxis) / 2;

    const leftIndices: number[] = [];
    const rightIndices: number[] = [];

    for (const i of indices) {
      const centroid = this.getTriangleCentroid(i);
      if (centroid.getComponent(splitAxis) < splitPoint) {
        leftIndices.push(i);
      } else {
        rightIndices.push(i);
      }
    }

    // Handles case where many centroids evaluate exactly to the split point
    if (leftIndices.length === 0 || rightIndices.length === 0) {
        const mid = Math.floor(indices.length / 2);
        node.left = this.buildRecursive(indices.slice(0, mid), depth + 1);
        node.right = this.buildRecursive(indices.slice(mid), depth + 1);
        return node;
    }

    node.left = this.buildRecursive(leftIndices, depth + 1);
    node.right = this.buildRecursive(rightIndices, depth + 1);

    return node;
  }

  public intersect(ray: Ray): Intersection | null {
    if (!this.root) return null;

    ray.invDir = new THREE.Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);

    let closest: Intersection | null = null;
    let minT = Infinity;

    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const h = new THREE.Vector3();
    const s = new THREE.Vector3();
    const q = new THREE.Vector3();

    const intersectTriangle = (triIdx: number) => {
      const i = triIdx * 9;
      v0.set(this.triangles[i], this.triangles[i+1], this.triangles[i+2]);
      v1.set(this.triangles[i+3], this.triangles[i+4], this.triangles[i+5]);
      v2.set(this.triangles[i+6], this.triangles[i+7], this.triangles[i+8]);

      edge1.subVectors(v1, v0);
      edge2.subVectors(v2, v0);
      h.crossVectors(ray.direction, edge2);
      const a = edge1.dot(h);

      if (a > -0.00001 && a < 0.00001) return;

      const f = 1.0 / a;
      s.subVectors(ray.origin, v0);
      const u = f * s.dot(h);

      if (u < 0.0 || u > 1.0) return;

      q.crossVectors(s, edge1);
      const v = f * ray.direction.dot(q);

      if (v < 0.0 || u + v > 1.0) return;

      const t = f * edge2.dot(q);

      if (t > 0.00001 && t < minT) {
        minT = t;
        const point = new THREE.Vector3().copy(ray.origin).addScaledVector(ray.direction, t);
        const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
        closest = { t, point, normal, objectId: this.objectIds[triIdx] };
      }
    };

    const stack: BVHNode[] = [this.root];

    while (stack.length > 0) {
      const node = stack.pop()!;

      if (!node.bounds.intersect(ray)) continue;

      if (node.triangleIndices.length > 0) {
        for (const idx of node.triangleIndices) {
          intersectTriangle(idx);
        }
      } else {
        if (node.left) stack.push(node.left);
        if (node.right) stack.push(node.right); // Could optimize to push closest first
      }
    }

    return closest;
  }
}
