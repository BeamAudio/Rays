import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';

interface BalloonVisualizerProps {
  hSpread: number;
  vSpread: number;
}

export const BalloonVisualizer: React.FC<BalloonVisualizerProps> = ({ hSpread, vSpread }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Generate morphed sphere vertices based on H/V spread (Gaussian Horn Model)
  const balloonGeometry = useMemo(() => {
    const segments = 64;
    const geometry = new THREE.SphereGeometry(2, segments, segments);
    const positions = geometry.attributes.position;
    
    const hRad = (hSpread / 2) * (Math.PI / 180);
    const vRad = (vSpread / 2) * (Math.PI / 180);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Convert to spherical coordinates
      const p = new THREE.Vector3(x, y, z).normalize();
      
      // Calculate angle from Z axis (our main beam axis)
      const theta = Math.acos(p.z); // polar angle from Z
      const phi = Math.atan2(p.y, p.x); // azimuthal angle

      // Proportional spread weighting
      const hWeight = Math.cos(phi);
      const vWeight = Math.sin(phi);
      
      const effectiveSigma = Math.sqrt(
        Math.pow(hRad * hWeight, 2) + Math.pow(vRad * vWeight, 2)
      );

      // Gaussian attenuation: R = R0 * exp(-theta^2 / (2 * sigma^2))
      const scale = Math.exp(-Math.pow(theta, 2) / (2 * Math.pow(effectiveSigma || 0.1, 2)));
      
      // Apply scale (clamped to avoid zero-size)
      const r = Math.max(0.1, scale * 2.5);
      positions.setXYZ(i, p.x * r, p.y * r, p.z * r);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }, [hSpread, vSpread]);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.2;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={40} />
      <OrbitControls 
        enablePan={false} 
        enableZoom={true} 
        minDistance={4} 
        maxDistance={12} 
        autoRotate 
        autoRotateSpeed={0.5}
      />
      
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1.5} color="#00ffff" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ff00ff" />

      <mesh ref={meshRef} geometry={balloonGeometry}>
        <meshStandardMaterial 
          color="#00ffff" 
          emissive="#00ffff"
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
          roughness={0.1}
          metalness={0.9}
          wireframe
        />
      </mesh>
      
      {/* Reference Axis */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 1.5]}>
        <cylinderGeometry args={[0.02, 0.02, 3, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
      </mesh>
    </>
  );
};
