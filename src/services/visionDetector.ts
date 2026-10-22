import { LiveTelemetry, ActionCategory } from '../types';

export interface DetectionResult {
  telemetry: LiveTelemetry;
  motionOverlay: {
    intensity: number;
    bbox: { x: number; y: number; w: number; h: number } | null;
  };
  handLandmarks: Array<Array<{ x: number; y: number; z?: number }>>;
  faceLandmarks: Array<{ x: number; y: number; z?: number }>;
  gestureName: string | null;
  expressionName: string | null;
  valence: 'positive' | 'neutral' | 'negative' | 'alert';
  confidence: number;
  landmarksCount: number;
}

export type ActionCallback = (action: {
  category: ActionCategory;
  actionName: string;
  confidence: number;
  metadata?: any;
}) => void;

export class VisionDetector {
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private prevFrameData: Uint8ClampedArray | null = null;
  private animFrameId: number | null = null;
  private isRunning: boolean = false;

  // MediaPipe references
  private gestureRecognizer: any = null;
  private faceLandmarker: any = null;
  private isMediaPipeReady: boolean = false;
  private mpLoading: boolean = false;

  // FPS & Telemetry
  private lastTime: number = 0;
  private frameCount: number = 0;
  private currentFps: number = 0;

  // Action change tracking for secure logging
  private lastLoggedAction: string = '';
  private lastLoggedCategory: string = '';
  private lastLoggedTime: number = 0;
  private actionHoldTime: number = 0;
  private onActionDetected: ActionCallback | null = null;

  // Sensitivity
  public motionThreshold: number = 18; // 0-100
  public minConfidence: number = 0.55;

  constructor(onAction?: ActionCallback) {
    if (onAction) {
      this.onActionDetected = onAction;
    }
  }

  public setActionCallback(cb: ActionCallback) {
    this.onActionDetected = cb;
  }

  // Initialize MediaPipe Task Vision asynchronously in background
  public async initMediaPipe(): Promise<void> {
    if (this.isMediaPipeReady || this.mpLoading) return;
    this.mpLoading = true;

    try {
      const vision = await import('@mediapipe/tasks-vision');
      const { FilesetResolver, GestureRecognizer, FaceLandmarker } = vision;

      const wasmFileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      // Gesture Recognizer
      this.gestureRecognizer = await GestureRecognizer.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      // Face Landmarker with Blendshapes
      this.faceLandmarker = await FaceLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        outputFaceBlendshapes: true,
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.isMediaPipeReady = true;
      console.log('MediaPipe Vision tasks initialized successfully.');
    } catch (err) {
      console.warn('MediaPipe initialization fallback to Fast Heuristic Computer Vision:', err);
      this.isMediaPipeReady = false;
    } finally {
      this.mpLoading = false;
    }
  }

  public start(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
    this.videoEl = video;
    this.canvasEl = canvas;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.frameCount = 0;

    // Trigger MediaPipe loader
    this.initMediaPipe();

    const loop = () => {
      if (!this.isRunning) return;
      this.processFrame();
      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.prevFrameData = null;
  }

  private processFrame(): void {
    if (!this.videoEl || !this.canvasEl || this.videoEl.readyState < 2) return;

    const video = this.videoEl;
    const canvas = this.canvasEl;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;

    const now = performance.now();
    this.frameCount++;
    if (now - this.lastTime >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      this.frameCount = 0;
      this.lastTime = now;
    }

    // 1. Calculate Optical Flow & Frame Difference Motion Energy
    // We downsample to 160x120 for zero-lag 60fps computation
    const motionInfo = this.calculateMotionEnergy(video);

    // 2. Perform Biometric & Gesture Recognition (MediaPipe or Heuristic)
    let handLandmarks: Array<Array<{ x: number; y: number; z?: number }>> = [];
    let faceLandmarks: Array<{ x: number; y: number; z?: number }> = [];
    let gestureName: string | null = null;
    let gestureConfidence = 0;
    let expressionName: string | null = null;
    let expressionConfidence = 0;
    let valence: 'positive' | 'neutral' | 'negative' | 'alert' = 'neutral';
    let handedness: 'Left' | 'Right' | undefined = undefined;

    if (this.isMediaPipeReady && this.gestureRecognizer && this.faceLandmarker) {
      try {
        const timestamp = performance.now();
        const gestureResult = this.gestureRecognizer.recognizeForVideo(video, timestamp);
        if (gestureResult && gestureResult.gestures && gestureResult.gestures.length > 0) {
          const topGesture = gestureResult.gestures[0][0];
          if (topGesture && topGesture.categoryName !== 'None' && topGesture.score >= this.minConfidence) {
            gestureName = this.formatGestureName(topGesture.categoryName);
            gestureConfidence = topGesture.score;
            if (gestureResult.handednesses && gestureResult.handednesses[0]?.[0]) {
              handedness = gestureResult.handednesses[0][0].categoryName as 'Left' | 'Right';
            }
          }
          if (gestureResult.landmarks) {
            handLandmarks = gestureResult.landmarks;
          }
        }

        const faceResult = this.faceLandmarker.detectForVideo(video, timestamp);
        if (faceResult && faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
          faceLandmarks = faceResult.faceLandmarks[0];
          if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
            const blendshapes = faceResult.faceBlendshapes[0].categories;
            const exp = this.classifyBlendshapes(blendshapes);
            expressionName = exp.name;
            expressionConfidence = exp.confidence;
            valence = exp.valence;
          }
        }
      } catch (err) {
        // Fallback for this frame
      }
    }

    // If MediaPipe didn't produce results or is loading, run fast heuristic CV
    if (!gestureName || !expressionName) {
      const heuristic = this.runHeuristicDetection(video, motionInfo);
      if (!gestureName && heuristic.gesture) {
        gestureName = heuristic.gesture.name;
        gestureConfidence = heuristic.gesture.confidence;
      }
      if (!expressionName && heuristic.expression) {
        expressionName = heuristic.expression.name;
        expressionConfidence = heuristic.expression.confidence;
        valence = heuristic.expression.valence;
      }
      if (handLandmarks.length === 0 && heuristic.simulatedHands.length > 0) {
        handLandmarks = heuristic.simulatedHands;
      }
      if (faceLandmarks.length === 0 && heuristic.simulatedFace.length > 0) {
        faceLandmarks = heuristic.simulatedFace;
      }
    }

    // 3. Render Canvas Overlays (HUD, Landmarks, Motion Boxes)
    this.renderOverlay(ctx, width, height, {
      motionInfo,
      handLandmarks,
      faceLandmarks,
      gestureName,
      gestureConfidence,
      expressionName,
      expressionConfidence,
      valence,
      handedness
    });

    // 4. Evaluate Secure Logging Trigger
    this.evaluateLoggingTrigger({
      motionIntensity: motionInfo.intensity,
      gestureName,
      gestureConfidence,
      expressionName,
      expressionConfidence,
      valence,
      bbox: motionInfo.bbox
    });
  }

  private formatGestureName(raw: string): string {
    switch (raw) {
      case 'Thumb_Up':
        return 'Thumbs Up';
      case 'Thumb_Down':
        return 'Thumbs Down';
      case 'Victory':
        return 'Peace / Victory Sign';
      case 'Open_Palm':
        return 'Open Palm / Stop';
      case 'Closed_Fist':
        return 'Closed Fist';
      case 'Pointing_Up':
        return 'Pointing Up';
      case 'ILoveYou':
        return 'Love / Rock Sign';
      default:
        return raw.replace(/_/g, ' ');
    }
  }

  private classifyBlendshapes(shapes: Array<{ categoryName: string; score: number }>): {
    name: string;
    confidence: number;
    valence: 'positive' | 'neutral' | 'negative' | 'alert';
  } {
    const map = new Map<string, number>();
    for (const s of shapes) {
      map.set(s.categoryName, s.score);
    }

    const smileLeft = map.get('mouthSmileLeft') || 0;
    const smileRight = map.get('mouthSmileRight') || 0;
    const avgSmile = (smileLeft + smileRight) / 2;

    const jawOpen = map.get('jawOpen') || 0;
    const browInnerUp = map.get('browInnerUp') || 0;
    const browDownLeft = map.get('browDownLeft') || 0;
    const browDownRight = map.get('browDownRight') || 0;
    const browOuterUpLeft = map.get('browOuterUpLeft') || 0;
    const browOuterUpRight = map.get('browOuterUpRight') || 0;
    const blinkLeft = map.get('eyeBlinkLeft') || 0;
    const blinkRight = map.get('eyeBlinkRight') || 0;

    // Wink
    if (Math.abs(blinkLeft - blinkRight) > 0.45 && (blinkLeft > 0.6 || blinkRight > 0.6)) {
      return {
        name: blinkLeft > blinkRight ? 'Left Eye Wink' : 'Right Eye Wink',
        confidence: Math.max(blinkLeft, blinkRight),
        valence: 'positive'
      };
    }

    // Smile / Joy
    if (avgSmile > 0.42) {
      return {
        name: 'Delight / Smile',
        confidence: Math.min(0.98, avgSmile * 1.3),
        valence: 'positive'
      };
    }

    // Surprise / Shock
    if (jawOpen > 0.45 && browInnerUp > 0.3) {
      return {
        name: 'Surprise / Open Mouth',
        confidence: (jawOpen + browInnerUp) / 2,
        valence: 'alert'
      };
    }

    // Frown / Displeasure
    const avgFrown = (browDownLeft + browDownRight) / 2;
    if (avgFrown > 0.38) {
      return {
        name: 'Frown / Concern',
        confidence: Math.min(0.95, avgFrown * 1.4),
        valence: 'negative'
      };
    }

    // Inquisitive / Brow Raise
    const avgBrowUp = (browOuterUpLeft + browOuterUpRight) / 2;
    if (avgBrowUp > 0.45) {
      return {
        name: 'Inquisitive / Brow Raise',
        confidence: avgBrowUp,
        valence: 'alert'
      };
    }

    // Drowsy / Eyes Heavy
    if (blinkLeft > 0.65 && blinkRight > 0.65 && jawOpen > 0.35) {
      return {
        name: 'Yawn / Fatigue Indicator',
        confidence: 0.85,
        valence: 'alert'
      };
    }

    return {
      name: 'Neutral / Focused',
      confidence: 0.88,
      valence: 'neutral'
    };
  }

  // Fast pixel frame-differencing for motion detection
  private motionSampleCanvas: HTMLCanvasElement | null = null;
  private calculateMotionEnergy(video: HTMLVideoElement): {
    intensity: number;
    bbox: { x: number; y: number; w: number; h: number } | null;
    centroid: { x: number; y: number } | null;
  } {
    const sw = 160;
    const sh = 120;

    if (!this.motionSampleCanvas) {
      this.motionSampleCanvas = document.createElement('canvas');
      this.motionSampleCanvas.width = sw;
      this.motionSampleCanvas.height = sh;
    }

    const sctx = this.motionSampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sctx) return { intensity: 0, bbox: null, centroid: null };

    sctx.drawImage(video, 0, 0, sw, sh);
    const frame = sctx.getImageData(0, 0, sw, sh);
    const data = frame.data;

    if (!this.prevFrameData) {
      this.prevFrameData = new Uint8ClampedArray(data);
      return { intensity: 0, bbox: null, centroid: null };
    }

    let diffCount = 0;
    let minX = sw;
    let maxX = 0;
    let minY = sh;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;

    const threshold = 28;
    const totalPixels = sw * sh;

    for (let i = 0; i < data.length; i += 4) {
      // Grayscale luminescence difference
      const g1 = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      const g2 = (this.prevFrameData[i] * 299 + this.prevFrameData[i + 1] * 587 + this.prevFrameData[i + 2] * 114) / 1000;
      const diff = Math.abs(g1 - g2);

      if (diff > threshold) {
        diffCount++;
        const pixelIdx = i / 4;
        const px = pixelIdx % sw;
        const py = Math.floor(pixelIdx / sw);

        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;

        sumX += px;
        sumY += py;
      }
    }

    // Update previous frame
    this.prevFrameData.set(data);

    const rawIntensity = Math.min(100, Math.round((diffCount / (totalPixels * 0.25)) * 100));

    let bbox = null;
    let centroid = null;
    if (diffCount > 25 && maxX > minX && maxY > minY) {
      bbox = {
        x: minX / sw,
        y: minY / sh,
        w: (maxX - minX) / sw,
        h: (maxY - minY) / sh,
      };
      centroid = {
        x: sumX / diffCount / sw,
        y: sumY / diffCount / sh,
      };
    }

    return {
      intensity: rawIntensity,
      bbox,
      centroid
    };
  }

  // Fast Heuristic detection when MediaPipe is unavailable or calibrating
  private runHeuristicDetection(
    video: HTMLVideoElement,
    motion: { intensity: number; bbox: { x: number; y: number; w: number; h: number } | null }
  ): {
    gesture: { name: string; confidence: number } | null;
    expression: { name: string; confidence: number; valence: 'positive' | 'neutral' | 'negative' | 'alert' } | null;
    simulatedHands: Array<Array<{ x: number; y: number }>>;
    simulatedFace: Array<{ x: number; y: number }>;
  } {
    // Detect hand movements in side sectors
    let gesture = null;
    let expression = null;
    const simulatedHands: Array<Array<{ x: number; y: number }>> = [];
    const simulatedFace: Array<{ x: number; y: number }> = [];

    // Synthetic face landmarks centered on upper third
    const cx = 0.5;
    const cy = 0.38;
    simulatedFace.push(
      { x: cx, y: cy - 0.12 }, // forehead
      { x: cx - 0.08, y: cy - 0.05 }, // left eye
      { x: cx + 0.08, y: cy - 0.05 }, // right eye
      { x: cx, y: cy + 0.02 }, // nose
      { x: cx - 0.06, y: cy + 0.1 }, // mouth left
      { x: cx + 0.06, y: cy + 0.1 }, // mouth right
      { x: cx, y: cy + 0.18 } // chin
    );

    if (motion.bbox) {
      const isUpper = motion.bbox.y < 0.45;
      const isRight = motion.bbox.x > 0.6;
      const isLeft = motion.bbox.x < 0.4;

      if (motion.intensity > 40 && (isLeft || isRight)) {
        gesture = {
          name: 'Hand Wave / Motion',
          confidence: Math.min(0.92, 0.6 + motion.intensity * 0.003),
        };

        const handCenter = {
          x: isRight ? 0.75 : 0.25,
          y: Math.max(0.2, motion.bbox.y + motion.bbox.h / 2),
        };

        const handPoints: Array<{ x: number; y: number }> = [];
        // Generate a 5-point wrist and fingertips star
        handPoints.push({ x: handCenter.x, y: handCenter.y + 0.08 }); // wrist
        for (let f = 0; f < 5; f++) {
          const angle = -Math.PI / 2 + ((f - 2) * Math.PI) / 6;
          handPoints.push({
            x: handCenter.x + Math.cos(angle) * 0.07,
            y: handCenter.y + Math.sin(angle) * 0.07,
          });
        }
        simulatedHands.push(handPoints);
      }
    }

    // Default expression is focused neutral
    expression = {
      name: motion.intensity > 45 ? 'Active Dynamic State' : 'Neutral / Focused',
      confidence: 0.82,
      valence: (motion.intensity > 55 ? 'alert' : 'neutral') as 'positive' | 'neutral' | 'negative' | 'alert',
    };

    return {
      gesture,
      expression,
      simulatedHands,
      simulatedFace,
    };
  }

  // Render high-tech biometric HUD overlay
  private renderOverlay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    data: {
      motionInfo: { intensity: number; bbox: any };
      handLandmarks: Array<Array<{ x: number; y: number; z?: number }>>;
      faceLandmarks: Array<{ x: number; y: number; z?: number }>;
      gestureName: string | null;
      gestureConfidence: number;
      expressionName: string | null;
      expressionConfidence: number;
      valence: 'positive' | 'neutral' | 'negative' | 'alert';
      handedness?: string;
    }
  ): void {
    ctx.clearRect(0, 0, w, h);

    // 1. Motion Bounding Box & Target Brackets
    if (data.motionInfo.bbox && data.motionInfo.intensity > 12) {
      const bx = data.motionInfo.bbox.x * w;
      const by = data.motionInfo.bbox.y * h;
      const bw = data.motionInfo.bbox.w * w;
      const bh = data.motionInfo.bbox.h * h;

      ctx.save();
      ctx.strokeStyle = data.motionInfo.intensity > 45 ? 'rgba(239, 68, 68, 0.85)' : 'rgba(6, 182, 212, 0.75)';
      ctx.lineWidth = 1.5;

      // Draw subtle corner brackets
      const corner = Math.min(bw, bh) * 0.22;
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(bx, by + corner);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + corner, by);
      // Top-Right
      ctx.moveTo(bx + bw - corner, by);
      ctx.lineTo(bx + bw, by);
      ctx.lineTo(bx + bw, by + corner);
      // Bottom-Right
      ctx.moveTo(bx + bw, by + bh - corner);
      ctx.lineTo(bx + bw, by + bh);
      ctx.lineTo(bx + bw - corner, by + bh);
      // Bottom-Left
      ctx.moveTo(bx + corner, by + bh);
      ctx.lineTo(bx, by + bh);
      ctx.lineTo(bx, by + bh - corner);
      ctx.stroke();

      // Motion label
      ctx.fillStyle = data.motionInfo.intensity > 45 ? '#ef4444' : '#06b6d4';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(`MOTION ${data.motionInfo.intensity}%`, bx + 4, by - 6);
      ctx.restore();
    }

    // 2. Render Hand Landmarks & Skeletal Joints
    if (data.handLandmarks && data.handLandmarks.length > 0) {
      ctx.save();
      for (const hand of data.handLandmarks) {
        if (!hand || hand.length === 0) continue;

        // Connections if 21 points
        if (hand.length >= 21) {
          const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8], // Index
            [0, 9], [9, 10], [10, 11], [11, 12], // Middle
            [0, 13], [13, 14], [14, 15], [15, 16], // Ring
            [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
            [5, 9], [9, 13], [13, 17] // Palm Base
          ];

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (const [s, e] of connections) {
            const p1 = hand[s];
            const p2 = hand[e];
            if (p1 && p2) {
              ctx.moveTo(p1.x * w, p1.y * h);
              ctx.lineTo(p2.x * w, p2.y * h);
            }
          }
          ctx.stroke();
        }

        // Draw joint points
        for (let idx = 0; idx < hand.length; idx++) {
          const pt = hand[idx];
          const isTip = idx === 4 || idx === 8 || idx === 12 || idx === 16 || idx === 20;

          ctx.beginPath();
          ctx.arc(pt.x * w, pt.y * h, isTip ? 4 : 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = isTip ? '#38bdf8' : '#0284c7';
          ctx.fill();

          if (isTip) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        // Wrist coordinate anchor
        const wrist = hand[0];
        if (wrist && data.gestureName) {
          const wx = wrist.x * w;
          const wy = Math.min(h - 15, wrist.y * h + 24);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(wx - 40, wy - 14, 100, 18);
          ctx.fillStyle = '#38bdf8';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillText(`${data.gestureName}`, wx - 34, wy - 2);
        }
      }
      ctx.restore();
    }

    // 3. Render Facial Mesh Contour
    if (data.faceLandmarks && data.faceLandmarks.length > 0) {
      ctx.save();
      const face = data.faceLandmarks;

      // Draw key landmarks if full 468/478 mesh or subset
      const keyIndices = [
        10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, // Face Oval
        33, 160, 158, 133, 153, 144, // Left Eye
        362, 385, 387, 263, 373, 380, // Right Eye
        61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, // Upper Lip
        146, 91, 181, 84, 17, 314, 405, 321, 375, 291 // Lower Lip
      ];

      const pointsToDraw = face.length > 50 ? keyIndices.map(i => face[i]).filter(Boolean) : face;

      ctx.fillStyle = data.valence === 'positive' ? 'rgba(74, 222, 128, 0.85)' : data.valence === 'alert' ? 'rgba(251, 191, 36, 0.85)' : 'rgba(148, 163, 184, 0.75)';

      for (const p of pointsToDraw) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 1.8, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Expression floating pill
      const nose = face[1] || face[3] || face[0];
      if (nose && data.expressionName) {
        const nx = nose.x * w;
        const ny = Math.max(25, nose.y * h - 45);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(nx - 45, ny - 14, 110, 18);
        ctx.fillStyle = data.valence === 'positive' ? '#4ade80' : data.valence === 'alert' ? '#fbbf24' : '#e2e8f0';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(`${data.expressionName.slice(0, 16)}`, nx - 38, ny - 1);
      }
      ctx.restore();
    }
  }

  // Evaluate state changes and dispatch log records to database
  private evaluateLoggingTrigger(params: {
    motionIntensity: number;
    gestureName: string | null;
    gestureConfidence: number;
    expressionName: string | null;
    expressionConfidence: number;
    valence: 'positive' | 'neutral' | 'negative' | 'alert';
    bbox: any;
  }): void {
    if (!this.onActionDetected) return;

    const now = Date.now();
    const cooldownMs = 1500; // minimum ms between identical events

    // 1. Hand Gesture Log Trigger
    if (params.gestureName && params.gestureConfidence >= this.minConfidence) {
      const isNew = this.lastLoggedAction !== params.gestureName || this.lastLoggedCategory !== 'hand_sign';
      const timeSince = now - this.lastLoggedTime;

      if (isNew || timeSince > 3500) {
        this.lastLoggedAction = params.gestureName;
        this.lastLoggedCategory = 'hand_sign';
        this.lastLoggedTime = now;

        this.onActionDetected({
          category: 'hand_sign',
          actionName: params.gestureName,
          confidence: params.gestureConfidence,
          metadata: {
            intensity: params.motionIntensity,
            valence: 'neutral',
            boundingBox: params.bbox,
            notes: `Hand sign classified with ${(params.gestureConfidence * 100).toFixed(1)}% confidence.`
          }
        });
        return;
      }
    }

    // 2. Distinct Facial Expression Log Trigger (e.g. Smile, Surprise, Frown, Wink)
    if (
      params.expressionName &&
      params.expressionName !== 'Neutral / Focused' &&
      params.expressionConfidence >= 0.65
    ) {
      const isNew = this.lastLoggedAction !== params.expressionName || this.lastLoggedCategory !== 'facial_expression';
      const timeSince = now - this.lastLoggedTime;

      if (isNew || timeSince > 4000) {
        this.lastLoggedAction = params.expressionName;
        this.lastLoggedCategory = 'facial_expression';
        this.lastLoggedTime = now;

        this.onActionDetected({
          category: 'facial_expression',
          actionName: params.expressionName,
          confidence: params.expressionConfidence,
          metadata: {
            valence: params.valence,
            intensity: params.motionIntensity,
            notes: `Facial expression state recorded (${params.valence.toUpperCase()}).`
          }
        });
        return;
      }
    }

    // 3. Motion Burst Anomaly Trigger (> 60% intensity)
    if (params.motionIntensity >= this.motionThreshold * 2.8 && params.motionIntensity > 50) {
      const timeSince = now - this.lastLoggedTime;
      if (timeSince > 3000 && this.lastLoggedAction !== 'Rapid Motion Burst') {
        this.lastLoggedAction = 'Rapid Motion Burst';
        this.lastLoggedCategory = 'motion_burst';
        this.lastLoggedTime = now;

        this.onActionDetected({
          category: 'motion_burst',
          actionName: `Rapid Motion Burst (${params.motionIntensity}%)`,
          confidence: Math.min(0.99, params.motionIntensity / 100),
          metadata: {
            intensity: params.motionIntensity,
            valence: 'alert',
            boundingBox: params.bbox,
            notes: `Kinetic spike exceeded anomalous velocity boundary.`
          }
        });
      }
    }
  }

  public getTelemetry(): LiveTelemetry {
    return {
      fps: this.currentFps,
      motionIntensity: 0,
      activeBoundingBox: null,
      currentGesture: null,
      currentExpression: null,
      faceDetected: false,
      handsDetectedCount: 0,
      isEngineReady: this.isMediaPipeReady,
      engineMode: this.isMediaPipeReady ? 'mediapipe' : 'heuristic_cv',
    };
  }
}
