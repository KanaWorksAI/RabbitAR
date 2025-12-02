
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      boxGeometry: any;
      meshStandardMaterial: any;
      planeGeometry: any;
      meshBasicMaterial: any;
    }
  }
}

export const CyberpunkRabbit: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      // Gentle idle animation - Vertical Float ONLY
      // Removed rotation.y because rotation is now controlled by the hand orientation
      // Offset by 0.25 in the float calculation to keep it roughly grounded
      groupRef.current.position.y = 0.25 + Math.sin(state.clock.elapsedTime * 1) * 0.05;
    }
  });

  return (
    // Removed rotation={[0, Math.PI, 0]} so the model aligns with the parent container's Z-forward
    <group ref={groupRef}>
      <Float speed={2} rotationIntensity={0} floatIntensity={0.2} floatingRange={[0, 0.1]}>
        {/* We shift everything up so the bottom of the body (formerly at -0.25) is at 0 */}
        {/* Wait, standard positions: Body y=0.1, h=0.7 -> bottom -0.25. */}
        {/* If we set the whole group y to 0.25 (in useFrame), the bottom is at 0. */}
        
        {/* Head */}
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.4} metalness={0.2} />
        </mesh>

        {/* Ears */}
        <group position={[0, 1.2, 0]}>
          <mesh position={[-0.2, 0.4, 0]} rotation={[0, 0, -0.2]}>
            <boxGeometry args={[0.15, 0.6, 0.15]} />
            <meshStandardMaterial color="#f0f0f0" />
          </mesh>
           <mesh position={[0.2, 0.4, 0]} rotation={[0, 0, 0.2]}>
            <boxGeometry args={[0.15, 0.6, 0.15]} />
            <meshStandardMaterial color="#f0f0f0" />
          </mesh>
        </group>

        {/* Cyber Eye - Fixed Material Crash */}
        <mesh position={[0.18, 0.9, 0.36]}>
           <boxGeometry args={[0.2, 0.2, 0.1]} />
           <meshStandardMaterial 
              color="#ff0033" 
              emissive="#ff0033" 
              emissiveIntensity={3} 
              toneMapped={false} 
           />
        </mesh>

        {/* Body */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.6, 0.7, 0.4]} />
          <meshStandardMaterial color="#FFD700" roughness={0.3} metalness={0.5} />
        </mesh>
        
        {/* Label */}
        <mesh position={[0, 0.2, 0.21]}>
           <planeGeometry args={[0.4, 0.1]} />
           <meshBasicMaterial color="#000" />
        </mesh>

      </Float>
    </group>
  );
};
