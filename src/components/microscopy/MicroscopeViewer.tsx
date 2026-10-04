import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Detection, MicroscopeObjective } from '../../types';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  PlusCircle,
  Trash2,
  CheckCircle,
  Crosshair,
  Ruler,
  Camera,
  Sun,
  Compass,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { playShutterSnapshot, playTurretClick } from '../../lib/audioOpticalFeedback';

interface MicroscopeViewerProps {
  imageUrl: string;
  detections: Detection[];
  selectedDetectionId?: string | null;
  onSelectDetection?: (id: string | null) => void;
  onToggleConfirm?: (id: string) => void;
  onRejectDetection?: (id: string) => void;
  onAddManualDetection?: (detection: Omit<Detection, 'id'>) => void;
  objective?: MicroscopeObjective;
  totalMagnification?: string;
  slideLabel?: string;
  availableClasses?: string[];
  currentField?: number;
  totalFields?: number;
  onFieldChange?: (newField: number) => void;
  isScanning?: boolean;
}

type ViewFilterMode = 'boxes' | 'original' | 'enhanced' | 'split' | 'darkfield';
type LightFilter = 'daylight' | 'halogen' | 'daylight_blue' | 'fluorescence_filter';

const CLASS_COLORS: Record<string, { stroke: string; fill: string; text: string }> = {
  'Giardia lamblia cyst': { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)', text: '#0891b2' },
  'Entamoeba histolytica': { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)', text: '#d97706' },
  'Hookworm egg': { stroke: '#ea580c', fill: 'rgba(234, 88, 12, 0.15)', text: '#c2410c' },
  'Ascaris lumbricoides ovum': { stroke: '#d97706', fill: 'rgba(217, 119, 6, 0.15)', text: '#b45309' },
  'Plasmodium falciparum ring': { stroke: '#dc2626', fill: 'rgba(220, 38, 38, 0.15)', text: '#b91c1c' },
  'Erythrocyte (RBC)': { stroke: '#e11d48', fill: 'rgba(225, 29, 72, 0.12)', text: '#be123c' },
  'Polymorphonuclear Neutrophil': { stroke: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.15)', text: '#7c3aed' },
  'Pus cell (Leukocyte)': { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.15)', text: '#9333ea' },
  'Calcium oxalate dihydrate': { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)', text: '#059669' },
  'Squamous epithelial cell': { stroke: '#64748b', fill: 'rgba(100, 116, 139, 0.15)', text: '#475569' }
};

function getColorForClass(className: string) {
  if (CLASS_COLORS[className]) return CLASS_COLORS[className];
  return { stroke: '#0284c7', fill: 'rgba(2, 132, 199, 0.15)', text: '#0369a1' };
}

export const MicroscopeViewer: React.FC<MicroscopeViewerProps> = ({
  imageUrl,
  detections,
  selectedDetectionId,
  onSelectDetection,
  onToggleConfirm,
  onRejectDetection,
  onAddManualDetection,
  objective = '40x',
  totalMagnification = '400x',
  slideLabel = 'SLD-CURRENT',
  availableClasses = ['Giardia lamblia cyst', 'Entamoeba histolytica', 'Hookworm egg', 'Ascaris lumbricoides ovum', 'Pus cell (Leukocyte)'],
  currentField = 1,
  totalFields = 10,
  onFieldChange,
  isScanning = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [filterMode, setFilterMode] = useState<ViewFilterMode>('boxes');
  const [isAddingBox, setIsAddingBox] = useState<boolean>(false);
  const [selectedClassToAdd, setSelectedClassToAdd] = useState<string>(availableClasses[0] || 'Giardia lamblia cyst');
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Optical & Physical Microscope Controls
  const [isEyepieceMask, setIsEyepieceMask] = useState<boolean>(false);
  const [focusOffset, setFocusOffset] = useState<number>(0);
  const [irisAperture, setIrisAperture] = useState<number>(75); // 20% to 100% iris condenser opening
  const [lightFilter, setLightFilter] = useState<LightFilter>('daylight_blue');
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [showReticleGrid, setShowReticleGrid] = useState<boolean>(false);
  const [rulerPoints, setRulerPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number } | null>(null);
  const [snapshotFeedback, setSnapshotFeedback] = useState<boolean>(false);

  // Mechanical Stage Vernier Coordinates (in millimeters, simulating real Leica/Olympus mechanical stage)
  const [stageVernierX, setStageVernierX] = useState<number>(42.5);
  const [stageVernierY, setStageVernierY] = useState<number>(18.3);

  // Touch gesture state
  const touchStartDistRef = useRef<number | null>(null);

  const pxPerMicron = objective === '100x_oil' ? 6.0 : objective === '40x' ? 3.2 : 0.8;

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      imageObjRef.current = img;
      renderCanvas();
    };
  }, [imageUrl]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageObjRef.current;
    if (!img) return;

    const imgWidth = img.naturalWidth || 1200;
    const imgHeight = img.naturalHeight || 900;

    canvas.width = imgWidth;
    canvas.height = imgHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate Optical Filters
    const blurAmount = Math.abs(focusOffset) * 1.5;
    let filters: string[] = [];

    if (blurAmount > 0) {
      filters.push(`blur(${blurAmount}px)`);
    }

    // Iris Condenser Aperture: Closing increases contrast and edge refractivity
    const contrastFactor = 1.0 + (100 - irisAperture) * 0.007; // up to 1.56
    filters.push(`contrast(${contrastFactor.toFixed(2)})`);

    // Light Balance filter
    if (lightFilter === 'halogen') {
      filters.push('sepia(0.25) saturate(1.2) brightness(0.96)');
    } else if (lightFilter === 'daylight_blue') {
      filters.push('hue-rotate(5deg) saturate(1.15) brightness(1.02)');
    } else if (lightFilter === 'fluorescence_filter') {
      filters.push('invert(1) hue-rotate(90deg) contrast(1.7)');
    }

    if (filterMode === 'enhanced') {
      filters.push('contrast(1.45) saturate(1.35) brightness(0.95)');
    } else if (filterMode === 'darkfield') {
      filters.push('invert(1) hue-rotate(180deg) contrast(1.6) brightness(0.85)');
    }

    ctx.filter = filters.join(' ') || 'none';

    // Draw main specimen slide
    ctx.drawImage(img, 0, 0, imgWidth, imgHeight);
    ctx.filter = 'none';

    // Split view line if in split mode
    if (filterMode === 'split') {
      const splitX = imgWidth / 2;
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, imgHeight);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(splitX - 120, 20, 110, 30);
      ctx.fillRect(splitX + 10, 20, 110, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Original Slide', splitX - 110, 40);
      ctx.fillText('Roboflow YOLO', splitX + 20, 40);
      ctx.restore();
    }

    // Ocular Reticle Graticule (concentric millimeter rings & crosshair for cell sizing)
    if (showReticleGrid) {
      ctx.save();
      const centerX = imgWidth / 2;
      const centerY = imgHeight / 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);

      // Crosshair
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(imgWidth, centerY);
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, imgHeight);
      ctx.stroke();

      // Concentric circles
      [100, 220, 340].forEach(r => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Reticle center pip
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Draw bounding boxes if allowed by mode
    if (filterMode === 'boxes' || filterMode === 'enhanced' || filterMode === 'split' || filterMode === 'darkfield') {
      detections.forEach(det => {
        if (det.rejected) return;

        if (filterMode === 'split' && det.x < imgWidth / 2) {
          return;
        }

        const isSelected = det.id === selectedDetectionId;
        const color = getColorForClass(det.class);

        const left = det.x - det.width / 2;
        const top = det.y - det.height / 2;

        ctx.save();

        ctx.fillStyle = isSelected ? 'rgba(6, 182, 212, 0.25)' : color.fill;
        ctx.fillRect(left, top, det.width, det.height);

        ctx.strokeStyle = isSelected ? '#ffffff' : color.stroke;
        ctx.lineWidth = isSelected ? 3.5 : 2;
        ctx.setLineDash(det.confirmed ? [] : [4, 4]);
        ctx.strokeRect(left, top, det.width, det.height);

        // Reticle corners
        const cornerSize = 10;
        ctx.strokeStyle = isSelected ? '#38bdf8' : color.stroke;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        // Top-left
        ctx.beginPath();
        ctx.moveTo(left, top + cornerSize);
        ctx.lineTo(left, top);
        ctx.lineTo(left + cornerSize, top);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(left + det.width - cornerSize, top);
        ctx.lineTo(left + det.width, top);
        ctx.lineTo(left + det.width, top + cornerSize);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(left, top + det.height - cornerSize);
        ctx.lineTo(left, top + det.height);
        ctx.lineTo(left + cornerSize, top + det.height);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(left + det.width - cornerSize, top + det.height);
        ctx.lineTo(left + det.width, top + det.height);
        ctx.lineTo(left + det.width, top + det.height - cornerSize);
        ctx.stroke();

        // Label Tag
        const labelText = `${det.class} ${(det.confidence * 100).toFixed(0)}%`;
        ctx.font = 'bold 13px "Plus Jakarta Sans", monospace';
        const textMetrics = ctx.measureText(labelText);
        const tagHeight = 22;
        const tagWidth = textMetrics.width + 18;

        ctx.fillStyle = isSelected ? '#0f172a' : '#1e293b';
        ctx.fillRect(left, Math.max(0, top - tagHeight), tagWidth, tagHeight);

        if (det.confirmed) {
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(left + 8, Math.max(0, top - tagHeight) + 11, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = isSelected ? '#38bdf8' : '#f8fafc';
        ctx.fillText(labelText, left + (det.confirmed ? 18 : 8), Math.max(0, top - tagHeight) + 15);

        ctx.restore();
      });
    }

    // Ruler measurement caliper rendering
    if (rulerPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.fillStyle = '#f59e0b';
      ctx.lineWidth = 2.5;

      rulerPoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });

      if (rulerPoints.length === 2) {
        const [p1, p2] = rulerPoints;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);
        const micronDist = (pixelDist / pxPerMicron).toFixed(1);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(midX - 35, midY - 22, 70, 20);
        ctx.fillStyle = '#fef3c7';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`${micronDist} µm`, midX - 25, midY - 8);
      }
      ctx.restore();
    }

    // Manual dragging preview box
    if (isAddingBox && dragStart && dragCurrent) {
      const x1 = Math.min(dragStart.x, dragCurrent.x);
      const y1 = Math.min(dragStart.y, dragCurrent.y);
      const w = Math.abs(dragCurrent.x - dragStart.x);
      const h = Math.abs(dragCurrent.y - dragStart.y);

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.fillRect(x1, y1, w, h);
      ctx.strokeRect(x1, y1, w, h);

      ctx.fillStyle = '#0284c7';
      ctx.fillRect(x1, Math.max(0, y1 - 22), 170, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`+ Add: ${selectedClassToAdd}`, x1 + 6, Math.max(0, y1 - 22) + 15);
      ctx.restore();
    }

    // Optical Circular Eyepiece Mask with Vignette Edge Shading
    if (isEyepieceMask) {
      ctx.save();
      const centerX = imgWidth / 2;
      const centerY = imgHeight / 2;
      const radius = Math.min(imgWidth, imgHeight) * 0.47;

      ctx.beginPath();
      ctx.rect(0, 0, imgWidth, imgHeight);
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fillStyle = '#050811';
      ctx.fill();

      // Optical glass lens barrel rim
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Subtle lens glare reflection
      ctx.beginPath();
      ctx.arc(centerX - radius * 0.4, centerY - radius * 0.4, radius * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fill();

      ctx.restore();
    }

    // Calibrated Stage Micrometer Scale Bar
    ctx.save();
    const scaleBarWidthPx = objective === '100x_oil' ? 120 : objective === '40x' ? 80 : 40;
    const barX = imgWidth - scaleBarWidthPx - 40;
    const barY = imgHeight - 35;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(barX - 10, barY - 22, scaleBarWidthPx + 20, 32);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + scaleBarWidthPx, barY);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('20 µm', barX + scaleBarWidthPx / 2 - 16, barY - 6);
    ctx.restore();
  }, [
    detections,
    selectedDetectionId,
    filterMode,
    isAddingBox,
    dragStart,
    dragCurrent,
    selectedClassToAdd,
    objective,
    isEyepieceMask,
    focusOffset,
    irisAperture,
    lightFilter,
    showReticleGrid,
    rulerPoints,
    pxPerMicron
  ]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e.clientX, e.clientY);

    if (isMeasuring) {
      if (rulerPoints.length >= 2) {
        setRulerPoints([coords]);
      } else {
        setRulerPoints(prev => [...prev, coords]);
      }
      return;
    }

    if (isAddingBox) {
      setDragStart(coords);
      setDragCurrent(coords);
      return;
    }

    if (filterMode !== 'original') {
      const clicked = detections.find(d => {
        if (d.rejected) return false;
        const left = d.x - d.width / 2;
        const right = d.x + d.width / 2;
        const top = d.y - d.height / 2;
        const bottom = d.y + d.height / 2;
        return coords.x >= left && coords.x <= right && coords.y >= top && coords.y <= bottom;
      });

      if (clicked) {
        onSelectDetection?.(clicked.id);
        return;
      } else {
        onSelectDetection?.(null);
      }
    }

    if (zoom > 1) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e.clientX, e.clientY);
    setMouseCoords(coords);

    if (isAddingBox && dragStart) {
      setDragCurrent(coords);
      return;
    }

    if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      });
    }
  };

  const handleMouseUp = () => {
    if (isAddingBox && dragStart && dragCurrent) {
      const x1 = Math.min(dragStart.x, dragCurrent.x);
      const y1 = Math.min(dragStart.y, dragCurrent.y);
      const w = Math.abs(dragCurrent.x - dragStart.x);
      const h = Math.abs(dragCurrent.y - dragStart.y);

      if (w > 20 && h > 20) {
        onAddManualDetection?.({
          class: selectedClassToAdd,
          confidence: 1.0,
          x: x1 + w / 2,
          y: y1 + h / 2,
          width: w,
          height: h,
          confirmed: true,
          note: 'Manually verified target'
        });
      }
      setDragStart(null);
      setDragCurrent(null);
      setIsAddingBox(false);
      return;
    }

    setIsPanning(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const coords = getCanvasCoords(touch.clientX, touch.clientY);
      setStartPan({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
      setIsPanning(true);
      setMouseCoords(coords);
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && isPanning) {
      const touch = e.touches[0];
      setPan({
        x: touch.clientX - startPan.x,
        y: touch.clientY - startPan.y
      });
    } else if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const scaleDelta = dist / touchStartDistRef.current;
      setZoom(prev => Math.min(4, Math.max(0.5, prev * (scaleDelta > 1 ? 1.03 : 0.97))));
      touchStartDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    touchStartDistRef.current = null;
  };

  const handleCaptureSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    playShutterSnapshot();
    const link = document.createElement('a');
    link.download = `LenziAI_${slideLabel}_Field_${currentField}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setSnapshotFeedback(true);
    setTimeout(() => setSnapshotFeedback(false), 2000);
  };

  const translateMechanicalStage = (dxMm: number, dyMm: number) => {
    setStageVernierX(prev => parseFloat(Math.min(75, Math.max(10, prev + dxMm)).toFixed(2)));
    setStageVernierY(prev => parseFloat(Math.min(50, Math.max(5, prev + dyMm)).toFixed(2)));
    setPan(prev => ({
      x: prev.x - dxMm * 15,
      y: prev.y - dyMm * 15
    }));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setFocusOffset(0);
    setIrisAperture(75);
    setLightFilter('daylight_blue');
    setRulerPoints([]);
    setIsMeasuring(false);
    setShowReticleGrid(false);
  };

  const selectedDetection = detections.find(d => d.id === selectedDetectionId);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
      {/* Top Telemetry & Optical Controls Ribbon */}
      <div className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-2 bg-slate-950/90 border-b border-slate-800 text-sm text-slate-200 gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-mono text-cyan-400 font-semibold">
            <Crosshair className="w-3.5 h-3.5" />
            <span>{slideLabel}</span>
          </div>
          <span className="text-slate-600 dark:text-slate-400">·</span>
          <span className="font-mono text-slate-400">OBJ: {objective}</span>
          <span className="text-slate-600 dark:text-slate-400">·</span>
          <span className="font-mono text-slate-400">MAG: {totalMagnification}</span>
          <span className="text-slate-600 dark:text-slate-400">·</span>
          {/* Multi-field Scan Stepper */}
          <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">HPF:</span>
            <button
              type="button"
              onClick={() => {
                playTurretClick();
                onFieldChange?.(Math.max(1, currentField - 1));
              }}
              disabled={currentField <= 1}
              className="text-slate-400 hover:text-white disabled:opacity-30 px-1 cursor-pointer"
            >
              ◀
            </button>
            <span className="text-cyan-300 font-semibold">
              {currentField}/{totalFields}
            </span>
            <button
              type="button"
              onClick={() => {
                playTurretClick();
                onFieldChange?.(Math.min(totalFields, currentField + 1));
              }}
              disabled={currentField >= totalFields}
              className="text-slate-400 hover:text-white disabled:opacity-30 px-1 cursor-pointer"
            >
              ▶
            </button>
          </div>
        </div>

        {/* Optical Light & Contrast Filter Modes */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setFilterMode('boxes')}
            className={`px-2.5 py-1 rounded text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              filterMode === 'boxes'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Roboflow AI
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('original')}
            className={`px-2.5 py-1 rounded text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              filterMode === 'original'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Brightfield
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('enhanced')}
            className={`px-2.5 py-1 rounded text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              filterMode === 'enhanced'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Membrane Boost
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('darkfield')}
            className={`px-2.5 py-1 rounded text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              filterMode === 'darkfield'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Darkfield
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('split')}
            className={`px-2.5 py-1 rounded text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              filterMode === 'split'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Split
          </button>
        </div>

        {/* Optical Tools & Realism Toggles */}
        <div className="flex items-center gap-1.5">
          {/* Reticle grid toggle */}
          <button
            type="button"
            onClick={() => setShowReticleGrid(!showReticleGrid)}
            className={`p-1.5 rounded transition cursor-pointer ${
              showReticleGrid
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Toggle Concentric Ocular Reticle Graticule"
          >
            <Compass className="w-4 h-4" />
          </button>

          {/* Caliper measurement tool */}
          <button
            type="button"
            onClick={() => {
              setIsMeasuring(!isMeasuring);
              setRulerPoints([]);
            }}
            className={`p-1.5 rounded transition cursor-pointer ${
              isMeasuring
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Micrometer Caliper"
          >
            <Ruler className="w-4 h-4" />
          </button>

          {/* Eyepiece circular aperture */}
          <button
            type="button"
            onClick={() => setIsEyepieceMask(!isEyepieceMask)}
            className={`p-1.5 rounded transition cursor-pointer ${
              isEyepieceMask
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Circular Eyepiece Aperture"
          >
            <Sun className="w-4 h-4" />
          </button>

          {/* Shutter snapshot */}
          <button
            type="button"
            onClick={handleCaptureSnapshot}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
            title="Capture Field Photomicrograph"
          >
            <Camera className="w-4 h-4" />
          </button>

          <span className="text-slate-700 dark:text-slate-400">|</span>

          <button
            type="button"
            onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs w-10 text-center text-slate-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom(prev => Math.min(4, prev + 0.25))}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
            title="Reset All Controls"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Optical Canvas Stage */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-slate-950 overflow-hidden flex items-center justify-center cursor-default select-none min-h-[340px] sm:min-h-[460px] max-h-[75vh]"
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="relative inline-block"
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`max-w-full max-h-[68vh] object-contain rounded ${
              isMeasuring
                ? 'cursor-crosshair'
                : isAddingBox
                ? 'cursor-crosshair'
                : zoom > 1
                ? 'cursor-grab active:cursor-grabbing'
                : 'cursor-crosshair'
            }`}
          />
        </div>

        {/* Optical Scanning Sweep Animation */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-[0.5px]" />
            <div
              className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_18px_#22d3ee]"
              style={{
                animation: 'scanLaser 1.4s ease-in-out infinite alternate'
              }}
            />
            <div className="absolute top-4 inset-x-0 flex items-center justify-center">
              <div className="bg-slate-950/90 border border-cyan-500/60 px-4 py-2 rounded-xl text-cyan-300 font-mono text-xs flex items-center gap-2 shadow-2xl">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                <span>ROBOFLOW SERVERLESS INFERENCE ACTIVE · EXTRACTING MORPHOLOGY</span>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes scanLaser {
            0% { top: 5%; }
            100% { top: 95%; }
          }
        `}</style>

        {/* Live Coordinate & Stage Micrometer Vernier HUD */}
        <div className="absolute bottom-3 left-3 bg-slate-900/85 backdrop-blur-sm border border-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-mono text-slate-400 pointer-events-none flex items-center gap-3">
          <span>STAGE: X: {stageVernierX}mm · Y: {stageVernierY}mm</span>
          {mouseCoords && (
            <>
              <span className="text-slate-600 dark:text-slate-400">|</span>
              <span>PX: ({Math.round(mouseCoords.x)}, {Math.round(mouseCoords.y)})</span>
            </>
          )}
          {isMeasuring && rulerPoints.length === 1 && (
            <span className="text-amber-400 font-semibold animate-pulse">Click second point</span>
          )}
        </div>

        {/* Optical Condenser Diaphragm & Fine Focus Stack (Right Side) */}
        <div className="absolute right-3 bottom-14 flex flex-col items-center gap-2 z-10">
          {/* Condenser Iris Slider */}
          <div className="bg-slate-900/85 backdrop-blur-sm border border-slate-800 px-2 py-2 rounded-xl shadow-lg flex flex-col items-center gap-1 text-[10px] text-slate-400 font-mono">
            <span className="text-cyan-400 font-semibold">IRIS</span>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={irisAperture}
              onChange={e => setIrisAperture(parseInt(e.target.value, 10))}
              className="h-16 w-1 accent-cyan-500 -rotate-90 my-5 cursor-pointer"
              title="Condenser Iris Diaphragm Aperture"
            />
            <span className="text-[9px] text-slate-300">{irisAperture}%</span>
          </div>

          {/* Fine Focus Wheel */}
          <div className="bg-slate-900/85 backdrop-blur-sm border border-slate-800 px-2 py-2 rounded-xl shadow-lg flex flex-col items-center gap-1 text-[10px] text-slate-400 font-mono">
            <span className="text-cyan-400 font-semibold">FOCUS</span>
            <input
              type="range"
              min="-3"
              max="3"
              step="0.5"
              value={focusOffset}
              onChange={e => setFocusOffset(parseFloat(e.target.value))}
              className="h-16 w-1 accent-cyan-500 -rotate-90 my-5 cursor-pointer"
              title="Micrometer Fine Focus Wheel"
            />
            <button
              type="button"
              onClick={() => setFocusOffset(0)}
              className="hover:text-white px-1 py-0.5 rounded bg-slate-800 text-[9px] cursor-pointer"
            >
              {focusOffset === 0 ? '0µm' : `${focusOffset > 0 ? '+' : ''}${focusOffset}µm`}
            </button>
          </div>
        </div>

        {/* Mechanical Stage Translation Controls (X-Y Vernier Coaxial Knobs) */}
        <div className="absolute bottom-14 left-3 bg-slate-900/85 backdrop-blur-sm border border-slate-800 p-1.5 rounded-xl shadow-lg flex flex-col items-center gap-1 z-10 text-[10px] text-slate-400">
          <button
            type="button"
            onClick={() => translateMechanicalStage(0, -0.4)}
            className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer"
            title="Translate Stage Up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => translateMechanicalStage(-0.4, 0)}
              className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer"
              title="Translate Stage Left"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[9px] font-mono text-cyan-400 font-bold px-1">STAGE</span>
            <button
              type="button"
              onClick={() => translateMechanicalStage(0.4, 0)}
              className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer"
              title="Translate Stage Right"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => translateMechanicalStage(0, 0.4)}
            className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer"
            title="Translate Stage Down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Add Manual Target Floating Toolbar */}
        <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-2 rounded-xl shadow-lg flex items-center gap-2">
          {!isAddingBox ? (
            <button
              type="button"
              onClick={() => {
                setIsAddingBox(true);
                setIsMeasuring(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Label Cell / Organism</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-cyan-300 font-bold">Select &amp; Drag on Slide:</span>
              <select
                value={selectedClassToAdd}
                onChange={e => setSelectedClassToAdd(e.target.value)}
                className="bg-slate-800 text-slate-100 border border-slate-700 text-sm font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {availableClasses.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setIsAddingBox(false)}
                className="px-2.5 py-1.5 text-sm text-slate-300 hover:text-white bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {snapshotFeedback && (
          <div className="absolute top-4 inset-x-0 mx-auto w-64 bg-emerald-950/90 border border-emerald-700 text-emerald-300 text-xs py-2 px-3 rounded-lg text-center font-medium shadow-xl">
            ✓ Field Snapshot Downloaded
          </div>
        )}

        {/* Selected Box Quick Inspector Card */}
        {selectedDetection && (
          <div className="absolute top-4 right-4 bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 p-4 rounded-xl shadow-xl w-72 text-slate-200 text-sm z-10">
            <div className="flex items-start justify-between border-b border-slate-800 pb-2 mb-2">
              <div>
                <span className="font-semibold text-cyan-300 text-sm block">
                  {selectedDetection.class}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Confidence: {(selectedDetection.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-medium font-mono ${
                  selectedDetection.confirmed
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}
              >
                {selectedDetection.confirmed ? 'Confirmed' : 'Pending'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-300 mb-3">
              <div>
                Est. Size: {(selectedDetection.width / pxPerMicron).toFixed(1)} ×{' '}
                {(selectedDetection.height / pxPerMicron).toFixed(1)} µm
              </div>
              <div>
                Pos: ({Math.round(selectedDetection.x)}, {Math.round(selectedDetection.y)})
              </div>
            </div>

            {selectedDetection.note && (
              <p className="text-slate-300 italic mb-3 text-xs bg-slate-950/60 p-2 rounded border border-slate-800">
                "{selectedDetection.note}"
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onToggleConfirm?.(selectedDetection.id)}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-sm flex items-center justify-center gap-1 transition cursor-pointer ${
                  selectedDetection.confirmed
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{selectedDetection.confirmed ? 'Unconfirm' : 'Confirm'}</span>
              </button>
              <button
                type="button"
                onClick={() => onRejectDetection?.(selectedDetection.id)}
                className="py-1.5 px-2 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 hover:bg-rose-900/80 font-bold text-sm flex items-center gap-1 transition cursor-pointer"
                title="Reject false positive"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
