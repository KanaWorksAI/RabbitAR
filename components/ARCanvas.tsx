
import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { CyberpunkRabbit } from './CyberpunkRabbit';
import { UserModel } from './UserModel';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
    }
  }
}

interface ARCanvasProps {
  handPositionRef: React.MutableRefObject<THREE.Vector3>;
  handScaleRef: React.MutableRefObject<THREE.Vector3>;
  handRotationRef: React.MutableRefObject<THREE.Quaternion>;
  isVisible: boolean;
  modelUrl: string | null;
}

interface HandTrackerGroupProps {
  positionRef: React.MutableRefObject<THREE.Vector3>;
  scaleRef: React.MutableRefObject<THREE.Vector3>;
  rotationRef: React.MutableRefObject<THREE.Quaternion>;
  visible: boolean;
  children: React.ReactNode;
}

// Internal component to handle position and scale updates in the Three.js render loop
const HandTrackerGroup: React.FC<HandTrackerGroupProps> = ({ positionRef, scaleRef, rotationRef, visible, children }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame(() => {
    if (groupRef.current) {
      // Smoothly interpolate current position to target position from Ref
      // 0.2 is the lerp factor (smoothness)
      groupRef.current.position.lerp(positionRef.current, 0.2);
      
      // Smoothly interpolate scale based on hand size
      groupRef.current.scale.lerp(scaleRef.current, 0.1);

      // Smoothly interpolate rotation (SLERP)
      // 0.15 is smoothness factor
      groupRef.current.quaternion.slerp(rotationRef.current, 0.15);
    }
  });

  return (
    <group ref={groupRef} visible={visible}>
      {children}
    </group>
  );
};

export const ARCanvas: React.FC<ARCanvasProps> = ({ handPositionRef, handScaleRef, handRotationRef, isVisible, modelUrl }) => {
  return (
    <Canvas
      className="absolute inset-0 pointer-events-none !bg-transparent"
      style={{ 
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 10,
        background: 'transparent',
        pointerEvents: 'none'
      }}
      dpr={[1, 1.5]} // Reduced max DPR for stability
      gl={{ 
        alpha: true,
        antialias: true, 
        preserveDrawingBuffer: false,
        premultipliedAlpha: true,
        powerPreference: "default"
      }}
      onCreated={({ gl, scene }) => {
        // CRITICAL: Force clear color to transparent 0x000000 with 0 alpha
        // This prevents the canvas from rendering a black background over the video
        gl.setClearColor(0x000000, 0);
        scene.background = null;
      }}
    >
      <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
      
      <ambientLight intensity={1.5} />
      {/* Front Light - Adjusted to hit the face which is now facing +Z relative to camera */}
      <directionalLight position={[0, 5, 10]} intensity={2.5} />
      {/* Back Light */}
      <directionalLight position={[0, 5, -5]} intensity={1.0} color="#00ffff" />
      {/* Side Light */}
      <pointLight position={[5, -2, 5]} intensity={1} color="#ff00ff" />
      
      <HandTrackerGroup 
        positionRef={handPositionRef} 
        scaleRef={handScaleRef} 
        rotationRef={handRotationRef}
        visible={isVisible}
      >
        <Suspense fallback={null}>
          {modelUrl ? (
            <UserModel url={modelUrl} />
          ) : (
            <CyberpunkRabbit />
          )}
        </Suspense>
      </HandTrackerGroup>
    </Canvas>
  );
};
