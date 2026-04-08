import * as THREE from 'three';

export interface RoomOptions {
  width: number;
  depth: number;
  height: number;
  name: string;
}

export function generateShoebox(options: RoomOptions) {
  const { width, depth, height, name } = options;
  const walls = [];

  // Floor
  walls.push(createWall(`${name}_Floor`, [0, 0, 0], [-Math.PI / 2, 0, 0], [width, depth, 1]));
  // Ceiling
  walls.push(createWall(`${name}_Ceiling`, [0, height, 0], [Math.PI / 2, 0, 0], [width, depth, 1]));
  // Front
  walls.push(createWall(`${name}_Front`, [0, height / 2, -depth / 2], [0, 0, 0], [width, height, 1]));
  // Back
  walls.push(createWall(`${name}_Back`, [0, height / 2, depth / 2], [0, Math.PI, 0], [width, height, 1]));
  // Left
  walls.push(createWall(`${name}_Left`, [-width / 2, height / 2, 0], [0, Math.PI / 2, 0], [depth, height, 1]));
  // Right
  walls.push(createWall(`${name}_Right`, [width / 2, height / 2, 0], [0, -Math.PI / 2, 0], [depth, height, 1]));

  return walls;
}

function createWall(name: string, pos: [number, number, number], rot: [number, number, number], scale: [number, number, number]) {
  // Generate triangles for a plane of size 1x1 at origin, then transform
  const triangles = [
    -0.5, -0.5, 0,  0.5, -0.5, 0,  0.5, 0.5, 0,
    -0.5, -0.5, 0,  0.5, 0.5, 0, -0.5, 0.5, 0
  ];

  const dummy = new THREE.Object3D();
  dummy.position.set(...pos);
  dummy.rotation.set(...rot);
  dummy.scale.set(...scale);
  dummy.updateMatrixWorld();

  const transformedTriangles: number[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const v = new THREE.Vector3(triangles[i], triangles[i+1], triangles[i+2]);
    v.applyMatrix4(dummy.matrixWorld);
    transformedTriangles.push(v.x, v.y, v.z);
  }

  return {
    name,
    type: 'mesh' as const,
    shape: 'plane' as const,
    position: pos,
    rotation: rot,
    scale: scale,
    triangles: transformedTriangles,
    material: {
      name: 'Generic Wall',
      absorption: Array(24).fill(0.1),
      scattering: 0.1
    }
  };
}
