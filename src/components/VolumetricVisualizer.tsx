import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { VolumetricResult } from '../types';

interface VolumetricVisualizerProps {
  results: VolumetricResult[];
  minSpl?: number;
  maxSpl?: number;
}

export const VolumetricVisualizer: React.FC<VolumetricVisualizerProps> = ({ 
  results, 
  minSpl = 40, 
  maxSpl = 100 
}) => {
  const mesh = useMemo(() => {
    if (results.length === 0) return null;

    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const material = new THREE.MeshBasicMaterial();
    const instancedMesh = new THREE.InstancedMesh(geometry, material, results.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    results.forEach((res, i) => {
      const { position, metrics } = res;
      matrix.setPosition(position[0], position[1], position[2]);
      instancedMesh.setMatrixAt(i, matrix);

      // Map SPL to color: Blue (low) -> Red (high)
      const spl = metrics.spl[13] || 0; // Using 1kHz as default
      const intensity = (Math.max(minSpl, Math.min(maxSpl, spl)) - minSpl) / (maxSpl - minSpl);
      color.setHSL(0.7 - intensity * 0.7, 1, 0.5);
      instancedMesh.setColorAt(i, color);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    return instancedMesh;
  }, [results, minSpl, maxSpl]);

  return mesh ? <primitive object={mesh} /> : null;
};
