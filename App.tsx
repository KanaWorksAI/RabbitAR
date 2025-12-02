import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { ARCanvas } from './components/ARCanvas';
import { AppState } from './types';
import { Loader2, Camera, AlertCircle, Upload, X, SwitchCamera } from 'lucide-react';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [appState, setAppState] = useState<AppState>(AppState.LOADING_MODEL);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Optimization: Use Ref instead of State for high-frequency updates (60fps)
  const handPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  // Ref for dynamic scaling based on hand distance
  const handScaleRef = useRef<THREE.Vector3>(new THREE.Vector3(1, 1, 1));
  // Ref for dynamic rotation based on hand orientation
  const handRotationRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  
  const [isHandDetected, setIsHandDetected] = useState(false);
  // CRITICAL: Ref to track detection state inside the closure-heavy rAF loop
  const isHandDetectedRef = useRef(false);

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number>(0);
  
  // Hysteresis Refs
  const lastDetectionTimeRef = useRef<number>(0);

  // Custom Model State
  const [customModelUrl, setCustomModelUrl] = useState<string | null>(null);
  const [customModelName, setCustomModelName] = useState<string | null>(null);

  // Camera State
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const facingModeRef = useRef<'user' | 'environment'>('user'); // For access in loop

  // Debug Stats
  const [debugInfo, setDebugInfo] = useState<string>('Init...');

  // 1. Initialize Mediapipe
  useEffect(() => {
    const initMediapipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        setAppState(AppState.REQUESTING_PERMISSION);
        setDebugInfo("AI Loaded. Requesting Cam...");
      } catch (err) {
        console.error(err);
        setAppState(AppState.ERROR);
        setErrorMsg('Failed to load AI models. Please refresh.');
        setDebugInfo("AI Load Failed");
      }
    };

    initMediapipe();
  }, []);

  // 2. Initialize Camera when Model is Ready
  useEffect(() => {
    if (appState === AppState.REQUESTING_PERMISSION) {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]);

  const startCamera = async () => {
    try {
      // Stop existing tracks if any
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null; // Clear source
      }

      let stream: MediaStream;

      try {
        // Try requesting specific facing mode first
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingModeRef.current, // Use ref to be sure
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (err) {
        console.warn("Specific camera request failed, retrying with fallback...", err);
        setDebugInfo("Specific Cam Failed. Retrying...");
        
        // Fallback: Request ANY video device
        // This fixes "Requested device not found" on devices that don't strictly support 'user'/'environment'
        stream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setDebugInfo(`Cam Active. Waiting...`);
        
        // Only attach event listener if not already attached or just ensure logic handles re-trigger
        videoRef.current.onplaying = () => {
           console.log("Video playing, starting detection");
           setAppState(AppState.RUNNING);
           setDebugInfo(`Running`);
           predictWebcam();
        };

        await videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      setAppState(AppState.ERROR);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Camera Error: ${msg}. Please ensure camera is connected.`);
      setDebugInfo("Camera Error");
    }
  };

  const toggleCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    facingModeRef.current = newMode; // Update ref immediately for the loop
    
    setAppState(AppState.LOADING_MODEL); // Briefly show loading state
    setDebugInfo("Switching Camera...");
    
    // Small timeout to allow React to update UI/CSS before restarting stream
    setTimeout(() => {
        startCamera();
    }, 100);
  };

  // 3. Prediction Loop
  const predictWebcam = () => {
    const video = videoRef.current;
    const landmarker = handLandmarkerRef.current;

    if (!video || !landmarker) return;

    // Ensure video dimensions are valid before detecting
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      animationFrameRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    const startTimeMs = performance.now();
    
    // Safety check for valid timeline
    if (video.currentTime > 0) {
      try {
        const result = landmarker.detectForVideo(video, startTimeMs);

        if (result.landmarks && result.landmarks.length > 0) {
          lastDetectionTimeRef.current = performance.now();
          
          // Use Ref to check state because closure variable 'isHandDetected' might be stale
          if (!isHandDetectedRef.current) {
            isHandDetectedRef.current = true;
            setIsHandDetected(true);
            setDebugInfo(`Hand Found!`);
          }
          
          const landmarks = result.landmarks[0];
          
          // Use the wrist (0) and middle finger MCP (9) for generic hand size
          const wrist = landmarks[0];
          const middleFingerMCP = landmarks[9];
          const indexFingerMCP = landmarks[5];
          const pinkyFingerMCP = landmarks[17];
          
          // --- POSITION CALCULATION ---
          // Adjusted to 30% Wrist / 70% Middle Finger Knuckle.
          // This moves the anchor significantly towards the fingers ("Top of Screen").
          // Previously 50/50 was too close to wrist (felt like "on the arm").
          const ratio = 0; // 70% towards fingers
          const palmX = wrist.x * (1 - ratio) + middleFingerMCP.x * ratio;
          const palmY = wrist.y * (1 - ratio) + middleFingerMCP.y * ratio;

          // Determine X coordinate based on mirroring
          const isMirrored = facingModeRef.current === 'user';
          
          let xCoord3D = 0;
          if (isMirrored) {
             // Invert X because video is mirrored
             xCoord3D = (1 - palmX) * 2 - 1;
          } else {
             // Normal X
             xCoord3D = (palmX * 2) - 1;
          }

          // Convert normalized coordinates to Three.js world coordinates
          const vector = new THREE.Vector3(
            xCoord3D,
            -(palmY * 2 - 1) + 1,     // Y: Invert for WebGL coords
            -10             
          );

          // Adjust scaling to match camera FOV roughly at Z=0
          const distance = 5; // Camera Z
          const fov = 50;
          const vFov = (fov * Math.PI) / 180;
          const height = 2 * Math.tan(vFov / 2) * distance;
          const aspect = window.innerWidth / window.innerHeight;
          const width = height * aspect;

          vector.x *= width / 2;
          vector.y *= height / 2;
          
          handPositionRef.current.copy(vector);

          // --- SCALE CALCULATION ---
          // Calculate Euclidean distance between wrist and middle finger knuckle
          const dx = wrist.x - middleFingerMCP.x;
          const dy = wrist.y - middleFingerMCP.y;
          const handSize = Math.sqrt(dx * dx + dy * dy);

          // Base multiplier tuned for "Rabbit on Palm" look
          const scaleMultiplier = 12; 
          const targetScale = handSize * scaleMultiplier;

          handScaleRef.current.set(targetScale, targetScale, targetScale);

          // --- ROTATION CALCULATION ---
          
          const getVector = (point: any) => {
             const xVal = isMirrored ? (1 - point.x) : point.x;
             const zVal = -point.z; // Z is depth away from camera

             return new THREE.Vector3(
                xVal * aspect, 
                -point.y, 
                zVal * aspect 
             );
          }

          const vWrist = getVector(wrist);
          const vMiddle = getVector(middleFingerMCP);
          const vIndex = getVector(indexFingerMCP);
          const vPinky = getVector(pinkyFingerMCP);

          // 1. Calculate Primary Hand Orientation Vectors
          // Finger Direction: Wrist -> Middle (Points towards user in most poses)
          const vecToUser = new THREE.Vector3().subVectors(vWrist, vMiddle);

          // Palm Across: Index -> Pinky (Right)
          const palmAcross = new THREE.Vector3().subVectors(vPinky, vIndex).normalize();
          
          // Palm Normal (Out of hand) - Used as fallback
          const fingerDir = new THREE.Vector3().subVectors(vMiddle, vWrist).normalize(); // Points away from user
          let palmNormal = new THREE.Vector3().crossVectors(palmAcross, fingerDir).normalize();
          if (palmNormal.z < 0) palmNormal.negate(); // Ensure normal points towards camera

          // 2. Determine "Forward" direction for the Model (Facing User)
          // We project the 'vecToUser' onto the horizontal plane (y=0) to keep model upright.
          const flatForward = new THREE.Vector3(vecToUser.x, 0, vecToUser.z);
          
          // Fallback: If hand is vertical (Stop Sign), vecToUser is vertical (y-axis dominant),
          // so the projection is a zero vector. In this case, use Palm Normal as forward.
          if (flatForward.lengthSq() < 0.01) {
             flatForward.set(palmNormal.x, 0, palmNormal.z);
          }
          
          flatForward.normalize();

          // 3. Construct Basis Vectors (Billboard Style)
          // UP (+Y): Always World Up (0, 1, 0)
          const targetY = new THREE.Vector3(0, 1, 0); 
          
          // FRONT (+Z): The projected forward vector (Facing User)
          const targetZ = flatForward;
          
          // RIGHT (+X): Cross(Y, Z)
          const targetX = new THREE.Vector3().crossVectors(targetY, targetZ).normalize();
          
          // Re-orthogonalize Z
          targetZ.crossVectors(targetX, targetY).normalize();

          // Create Rotation Matrix
          const rotationMatrix = new THREE.Matrix4().makeBasis(targetX, targetY, targetZ);
          const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
          
          handRotationRef.current.copy(targetQuaternion);

        } else {
          // Hand lost logic
          if (isHandDetectedRef.current) {
             const timeSinceLastDetect = performance.now() - lastDetectionTimeRef.current;
             if (timeSinceLastDetect > 50) { 
                isHandDetectedRef.current = false;
                setIsHandDetected(false);
                setDebugInfo("Hand Lost");
             }
          }
        }
      } catch (e) {
        console.warn("Detection error:", e);
      }
    }

    animationFrameRef.current = requestAnimationFrame(predictWebcam);
  };

  // --- FILE UPLOAD HANDLERS ---
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomModelUrl(url);
      setCustomModelName(file.name);
    }
  };

  const handleClearModel = () => {
    if (customModelUrl) {
      URL.revokeObjectURL(customModelUrl); // Cleanup memory
      setCustomModelUrl(null);
      setCustomModelName(null);
      // Reset file input value so the same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    // Changed bg-black to bg-zinc-900 to distinguish "App Background" from "Camera Failed (Black)"
    <div className="relative w-full h-screen bg-zinc-900 overflow-hidden touch-none">
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".glb,.gltf" 
        className="hidden" 
      />

      {/* Background Camera Feed */}
      {/* z-0 ensures it is at the bottom */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        {...({ webkitPlaysInline: "true" } as any)}
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
        style={{ 
          // Use explicit scaleX(1) for environment to ensure it overrides global CSS logic reliably
          transform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)' 
        }}
      />

      {/* AR Overlay - Always Mounted, Visibility Controlled internally */}
      {/* z-10 ensures it is above video but below UI */}
      {appState === AppState.RUNNING && (
        <ARCanvas 
          handPositionRef={handPositionRef} 
          handScaleRef={handScaleRef} 
          handRotationRef={handRotationRef}
          isVisible={isHandDetected}
          modelUrl={customModelUrl}
        />
      )}

      {/* UI Overlay */}
      {/* z-20 ensures it is on top of everything */}
      <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-6">
        
        {/* Header */}
        <div className="flex justify-between items-start">
           <div className="bg-black/50 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-xl pointer-events-auto">
              <h1 className="text-white font-bold text-lg tracking-wider flex items-center gap-2">
                 <span className="text-yellow-400">KANA</span> AR
              </h1>
              {customModelName && (
                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-xs text-green-300 truncate max-w-[100px]">{customModelName}</span>
                  <button onClick={handleClearModel} className="text-white/70 hover:text-white">
                    <X size={12} />
                  </button>
                </div>
              )}
           </div>
           
           {/* Right Side Controls */}
           <div className="flex flex-col gap-2 pointer-events-auto">
             {/* Upload Button */}
             <button 
               onClick={handleUploadClick}
               className="bg-white/10 hover:bg-white/20 backdrop-blur-md p-3 rounded-full border border-white/10 shadow-xl transition-all active:scale-95"
               aria-label="Upload Model"
             >
               <Upload className="w-5 h-5 text-white" />
             </button>

             {/* Switch Camera Button */}
             <button 
               onClick={toggleCamera}
               className="bg-white/10 hover:bg-white/20 backdrop-blur-md p-3 rounded-full border border-white/10 shadow-xl transition-all active:scale-95"
               aria-label="Switch Camera"
             >
               <SwitchCamera className="w-5 h-5 text-white" />
             </button>
             
             {/* DEBUG OVERLAY */}
             <div className="bg-black/50 p-2 rounded text-[10px] text-green-400 font-mono text-center">
                {debugInfo}
             </div>
           </div>
        </div>

        {/* Status Messages */}
        <div className="flex flex-col items-center justify-center gap-4">
          {appState === AppState.LOADING_MODEL && (
            <div className="flex flex-col items-center bg-black/70 p-6 rounded-3xl backdrop-blur-xl border border-white/10">
              <Loader2 className="w-10 h-10 text-yellow-400 animate-spin mb-4" />
              <p className="text-white font-medium">Loading AI...</p>
            </div>
          )}

          {appState === AppState.REQUESTING_PERMISSION && (
             <div className="flex flex-col items-center bg-black/70 p-6 rounded-3xl backdrop-blur-xl border border-white/10">
               <Camera className="w-10 h-10 text-blue-400 animate-pulse mb-4" />
               <p className="text-white font-medium">Opening Camera...</p>
             </div>
          )}

          {appState === AppState.ERROR && (
             <div className="flex flex-col items-center bg-red-900/80 p-6 rounded-3xl backdrop-blur-xl border border-red-500/30">
               <AlertCircle className="w-10 h-10 text-white mb-4" />
               <p className="text-white font-medium text-center">{errorMsg}</p>
             </div>
          )}

          {appState === AppState.RUNNING && !isHandDetected && (
            <div className="bg-black/40 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 animate-pulse transition-opacity duration-300">
              <p className="text-white font-semibold text-sm">Show your open palm to the camera</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center">
             <p className="text-white/30 text-[10px] uppercase tracking-widest">Powered by Three.js & Mediapipe</p>
        </div>
      </div>
    </div>
  );
};

export default App;