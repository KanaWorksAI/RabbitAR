
export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface DetectionResult {
  landmarks: HandLandmark[][];
  worldLandmarks: HandLandmark[][];
}

export enum AppState {
  IDLE = 'IDLE',
  LOADING_MODEL = 'LOADING_MODEL',
  REQUESTING_PERMISSION = 'REQUESTING_PERMISSION',
  RUNNING = 'RUNNING',
  ERROR = 'ERROR',
}
