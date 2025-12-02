
import React, { useEffect } from 'react';
import { useGLTF, Center } from '@react-three/drei';
import * as THREE from 'three';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      primitive: any;
    }
  }
}

interface UserModelProps {
  url: string;
}

export const UserModel: React.FC<UserModelProps> = ({ url }) => {
  // useGLTF loads the model from the Blob URL
  const { scene } = useGLTF(url);
  
  // We clone the scene to ensure we don't mutate the cached original if re-mounted
  const clone = React.useMemo(() => scene.clone(), [scene]);

  // Cleanup materials when url changes or component unmounts to prevent memory leaks
  useEffect(() => {
    return () => {
      clone.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        }
      });
    };
  }, [clone]);

  return (
    // Center logic update:
    // 'bottom' aligns the bottom of the bounding box to Y=0 (Palm Surface).
    // We REMOVED disableX/disableZ to force centering.
    // This ensures the model's visual mass is centered on the palm, correcting positioning 
    // errors for unoptimized models that might have origins far from the mesh.
    <Center bottom>
      <primitive 
        object={clone} 
        scale={[1, 1, 1]} 
      />
    </Center>
  );
};
