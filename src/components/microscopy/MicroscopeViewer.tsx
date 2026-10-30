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
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  LocateFixed,
  ScanSearch
} from 'lucide-react';
import { playShutterSnapshot, playTurretClick } from '../../lib/audioOpticalFeedback';

interface MicroscopeViewerProps {
  imageUrl: string;
  detections: Detection[];
  selectedDetectionId?: string | null;
  onSelectDetection?: (id: string | null) => void;
  onToggleConfirm?: (id: string) => void;
  onRejectDetection?: (id: string) => void;
  onAddManualDetection?: (detection: Omit<Detection, 'id'>) => void | Promise<void>;
  manualNote?: string;
  manualConfidence?: number;
  setManualNote?: (note: string) => void;
  setManualConfidence?: (conf: number) => void;
  objective?: MicroscopeObjective;
  totalMagnification?: string;
  slideLabel?: string;
  availableClasses?: string[];
  currentField?: number;
  totalFields?: number;
  onFieldChange?: (newField: number) => void;
  onPreviousSlide?: () => void;
  onNextSlide?: () => void;
  slideNavigationLabel?: string;
  canSwitchSlides?: boolean;
  isScanning?: boolean;
}

type ViewFilterMode = 'boxes' | 'original' | 'enhanced' | 'split' | 'darkfield';
type LightFilter = 'daylight' | 'halogen' | 'daylight_blue' | 'fluorescence_filter';

const CLASS_COLORS: Record<string, { stroke: string; fill: string; text: string }> = {
  'Ascaris lumbricoides': { stroke: '#d97706', fill: 'rgba(217, 119, 6, 0.15)', text: '#b45309' },
  'Ascaris lumbricoides ovum': { stroke: '#ea580c', fill: 'rgba(234, 88, 12, 0.15)', text: '#c2410c' },
  'Enterobius vermicularis': { stroke: '#0891b2', fill: 'rgba(8, 149, 178, 0.15)', text: '#0e7490' },
  'Fasciola hepatica': { stroke: '#16a34a', fill: 'rgba(22, 163, 74, 0.15)', text: '#15803d' },
  'Fasciolopsis buski': { stroke: '#7c3aed', fill: 'rgba(124, 58, 237, 0.15)', text: '#6d28d9' },
  'Giardia lamblia cyst': { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)', text: '#0891b2' },
  'Giardia': { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)', text: '#0891b2' },
  'Hookworm egg': { stroke: '#ea580c', fill: 'rgba(234, 88, 12, 0.15)', text: '#c2410c' },
  'Hymenolepis': { stroke: '#db2777', fill: 'rgba(219, 39, 119, 0.15)', text: '#be125c' },
  'Plasmodium falciparum ring': { stroke: '#dc2626', fill: 'rgba(220, 38, 38, 0.15)', text: '#b91c1c' },
  'Plasmodium falciparum': { stroke: '#dc2626', fill: 'rgba(220, 38, 38, 0.15)', text: '#b91c1c' },
  'Plasmodium malariae': { stroke: '#dc2626', fill: 'rgba(220, 38, 38, 0.15)', text: '#b91c1c' },
  'Plasmodium ovale': { stroke: '#dc2626', fill: 'rgba(220, 38, 38, 0.15)', text: '#b91c1c' },
  'Plasmodium vivax': { stroke: '#dc2626', fill: 'rgba(220, 38, 38, 0.15)', text: '#b91c1c' },
  'Schistosoma haematobium': { stroke: '#0891b2', fill: 'rgba(8, 149, 178, 0.15)', text: '#0e7490' },
  'Taenia solium': { stroke: '#7c3aed', fill: 'rgba(124, 58, 237, 0.15)', text: '#6d28d9' },
  'Taenia saginum': { stroke: '#7c3aed', fill: 'rgba(124, 58, 237, 0.15)', text: '#6d28d9' },
  'Trichuris trichiura': { stroke: '#db2777', fill: 'rgba(219, 39, 119, 0.15)', text: '#be125c' },
  'Trichuris trichiura ovum': { stroke: '#db2777', fill: 'rgba(219, 39, 119, 0.15)', text: '#be125c' },
  'Entamoeba histolytica': { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)', text: '#d97706' },
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

const MicroscopeViewerView: React.FC<MicroscopeViewerProps> = ({
  imageUrl,
  detections,
  selectedDetectionId,
  onSelectDetection,
  onToggleConfirm,
  onRejectDetection,
  onAddManualDetection,
  manualNote,
  manualConfidence,
  setManualNote: setManualNoteProp,
  setManualConfidence: setManualConfidenceProp,
  objective = '40x',
  totalMagnification = '400x',
  slideLabel = 'SLD-CURRENT',
  availableClasses = ['Giardia lamblia cyst', 'Entamoeba histolytica', 'Hookworm egg', 'Ascaris lumbricoides ovum', 'Trichuris trichiura ovum', 'Enterobius vermicularis', 'Fasciola hepatica', 'Fasciolopsis buski', 'Hymenolepis', 'Plasmodium falciparum', 'Plasmodium malariae', 'Plasmodium ovale', 'Plasmodium vivax', 'Schistosoma haematobium', 'Taenia solium', 'Pus cell (Leukocyte)'],
  currentField = 1,
  totalFields = 10,
  onFieldChange,
  onPreviousSlide,
  onNextSlide,
  slideNavigationLabel = 'Slide image',
  canSwitchSlides = false,
  isScanning = false
}: MicroscopeViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
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
  const [internalConfidence, setInternalConfidence] = useState<number>(manualConfidence ?? 1.0);
  const [internalNote, setInternalNote] = useState<string>(manualNote ?? '');  // Optical & Physical Microscope Controls
  const [isEyepieceMask, setIsEyepieceMask] = useState<boolean>(false);
  const [focusOffset, setFocusOffset] = useState<number>(0);
  const [irisAperture, setIrisAperture] = useState<number>(75); // 20% to 100% iris condenser opening
  const [lightFilter, setLightFilter] = useState<LightFilter>('daylight_blue');
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [showReticleGrid, setShowReticleGrid] = useState<boolean>(false);
  const [rulerPoints, setRulerPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number } | null>(null);
  const [snapshotFeedback, setSnapshotFeedback] = useState<boolean>(false);
  const [isSavingLabel, setIsSavingLabel] = useState<boolean>(false);
  // Consolidated Right Control Panel
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  // Mobile controls panel
  const [showControlsPanel, setShowControlsPanel] = useState<boolean>(false);

  const activeTool = isAddingBox
    ? 'label'
    : isMeasuring
    ? 'measure'
    : 'inspect';

  // Mechanical Stage Vernier Coordinates (in millimeters, simulating real Leica/Olympus mechanical stage)
  const [stageVernierX, setStageVernierX] = useState<number>(42.5);
  const [stageVernierY, setStageVernierY] = useState<number>(18.3);

  // Touch gesture state
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);

  const pxPerMicron = objective === '100x_oil' ? 6.0 : objective === '40x' ? 3.2 : 0.8;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 6;

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const clampPan = useCallback((nextPan: { x: number; y: number }, nextZoom: number) => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas || nextZoom <= MIN_ZOOM) return { x: 0, y: 0 };

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const imageWidth = canvas.offsetWidth;
    const imageHeight = canvas.offsetHeight;
    const maxX = Math.max(0, (imageWidth * nextZoom - viewportWidth) / 2);
    const maxY = Math.max(0, (imageHeight * nextZoom - viewportHeight) / 2);

    return {
      x: Math.min(maxX, Math.max(-maxX, nextPan.x)),
      y: Math.min(maxY, Math.max(-maxY, nextPan.y))
    };
  }, []);

  const zoomAroundPoint = useCallback((requestedZoom: number, clientX?: number, clientY?: number) => {
    const nextZoom = clampZoom(requestedZoom);
    const previousZoom = zoom;
    const viewport = viewportRef.current;

    if (!viewport || nextZoom === previousZoom) return;

    if (clientX === undefined || clientY === undefined) {
      setZoom(nextZoom);
      setPan(clampPan(pan, nextZoom));
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const pointerX = clientX - (rect.left + rect.width / 2);
    const pointerY = clientY - (rect.top + rect.height / 2);
    const ratio = nextZoom / previousZoom;
    const nextPan = {
      x: pointerX - (pointerX - pan.x) * ratio,
      y: pointerY - (pointerY - pan.y) * ratio
    };

    setZoom(nextZoom);
    setPan(clampPan(nextPan, nextZoom));
  }, [clampPan, pan, zoom]);

  // Load image
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    
    const onLoad = () => {
      if (cancelled) return;
      imageObjRef.current = img;
      renderCanvas();
    };
    
    const onError = () => {
      if (cancelled) return;
      imageObjRef.current = null;
    };
    
    img.onload = onLoad;
    img.onerror = onError;
    
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
      imageObjRef.current = null;
    };
  }, [imageUrl]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageObjRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return;

    // Ensure we're drawing the current image, not a stale reference
    if (!img.src || img.src !== imageUrl && imageUrl !== '') return;

    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    // Render at native resolution for quality
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
    try {
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, imgWidth, imgHeight);
      }
    } catch {
      // Image may have been detached; skip this frame
      return;
    }
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
      ctx.fillText('LenziAI YOLO', splitX + 20, 40);
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

      // Show real-time dimensions near the box
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(x1 + 6, y1 + 6, 130, 36);
      ctx.fillStyle = '#93c5fd';
      ctx.font = '11px monospace';
      ctx.fillText(`${Math.round(w)} × ${Math.round(h)} px`, x1 + 12, y1 + 24);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${((w / pxPerMicron).toFixed(1))} × ${((h / pxPerMicron).toFixed(1))} µm`, x1 + 12, y1 + 38);
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
      setPan(clampPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      }, zoom));
    }
  };

  const handleMouseUp = () => {
    if (isAddingBox && dragStart && dragCurrent) {
      const x1 = Math.min(dragStart.x, dragCurrent.x);
      const y1 = Math.min(dragStart.y, dragCurrent.y);
      const w = Math.abs(dragCurrent.x - dragStart.x);
      const h = Math.abs(dragCurrent.y - dragStart.y);

      if (w > 20 && h > 20) {
        setIsSavingLabel(true);
        Promise.resolve(onAddManualDetection?.({
          class: selectedClassToAdd,
          confidence: internalConfidence,
          x: x1 + w / 2,
          y: y1 + h / 2,
          width: w,
          height: h,
          confirmed: true,
          note: internalNote || 'Manually verified target'
        })).finally(() => setIsSavingLabel(false));
      }
      setDragStart(null);
      setDragCurrent(null);
      setIsAddingBox(false);
      return;
    }

    setIsPanning(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
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
      touchStartZoomRef.current = zoom;
      setIsPanning(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length === 1 && isPanning) {
      const touch = e.touches[0];
      setPan(clampPan({
        x: touch.clientX - startPan.x,
        y: touch.clientY - startPan.y
      }, zoom));
    } else if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midpointX = (t1.clientX + t2.clientX) / 2;
      const midpointY = (t1.clientY + t2.clientY) / 2;
      const nextZoom = clampZoom(touchStartZoomRef.current * (dist / touchStartDistRef.current));
      zoomAroundPoint(nextZoom, midpointX, midpointY);
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
    setPan(prev => clampPan({
      x: prev.x - dxMm * 15,
      y: prev.y - dyMm * 15
    }, zoom));
  };

  const resetView = () => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setFocusOffset(0);
    setIrisAperture(75);
    setLightFilter('daylight_blue');
    setRulerPoints([]);
    setIsMeasuring(false);
    setShowReticleGrid(false);
  };

  // Keep the workstation usable without reaching for the toolbar. These
  // shortcuts deliberately ignore form fields so class names, notes and
  // optical settings remain safe to edit.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;

      if (event.key === 'Escape') {
        setIsAddingBox(false);
        setIsMeasuring(false);
        setDragStart(null);
        setDragCurrent(null);
        setRulerPoints([]);
        return;
      }

      if (event.key === '0') {
        event.preventDefault();
        resetView();
      } else if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        setIsMeasuring(true);
        setIsAddingBox(false);
        setRulerPoints([]);
      } else if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setIsAddingBox(true);
        setIsMeasuring(false);
        setDragStart(null);
        setDragCurrent(null);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomAroundPoint(zoom + 0.25);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomAroundPoint(zoom - 0.25);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoom, zoomAroundPoint]);

  const selectedDetection = detections.find(d => d.id === selectedDetectionId);

  return (
    <div className="microscope-viewer self-start w-full flex flex-col h-auto min-h-0 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
      {/* Top Toolbar - Clean visual zones for Slide Info | View Modes | Tools */}
      <div className="microscope-viewer-toolbar bg-slate-950/95 border-b border-slate-800 px-3 sm:px-4 py-3.5">
        <div className="flex flex-col gap-3 xl:gap-4">
          {/* Left Zone: Slide Information & Field Stepper */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2 font-mono text-cyan-300 font-semibold bg-slate-900/80 px-3 py-2 rounded-lg border border-cyan-900/60 shadow-sm">
              <Crosshair className="w-5 h-5" />
              <span className="truncate max-w-[160px] sm:max-w-none text-sm sm:text-base">{slideLabel}</span>
            </div>
            <div className="flex items-center gap-2 px-1 sm:px-2 text-[11px] sm:text-xs">
              <span className="font-mono text-slate-400 text-sm">OBJ: {objective}</span>
              <span className="text-slate-600 dark:text-slate-400">·</span>
              <span className="font-mono text-slate-400 text-sm">MAG: {totalMagnification}</span>
            </div>
            {/* Multi-field Scan Stepper - Compact & Prominent */}
            <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-700">
              <span className="text-slate-300 text-xs font-semibold">HPF:</span>
              <button
                type="button"
                onClick={() => {
                  playTurretClick();
                  onFieldChange?.(Math.max(1, currentField - 1));
                }}
                disabled={currentField <= 1}
                className="flex items-center justify-center w-8 h-8 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer transition-colors touch-target"
                aria-label="Previous field"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-2">
                <span className="text-cyan-200 font-mono font-bold text-base min-w-[4ch] text-center">
                  {currentField}/{totalFields}
                </span>
                <span className="hidden sm:inline text-[10px] text-slate-500">/{totalFields}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  playTurretClick();
                  onFieldChange?.(Math.min(totalFields, currentField + 1));
                }}
                disabled={currentField >= totalFields}
                className="flex items-center justify-center w-8 h-8 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer transition-colors touch-target"
                aria-label="Next field"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center Zone: View Mode Filters - Prominent & Grouped */}
          <div className="w-full min-w-0 xl:max-w-none">
            <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-1.5">
              <div className="microscope-view-modes flex items-center justify-start gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="View filter modes">
                {['boxes', 'original', 'enhanced', 'darkfield', 'split'].map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode as ViewFilterMode)}
                    className={`px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer touch-target xl:min-w-[90px] ${
                      filterMode === mode
                        ? 'bg-cyan-500/30 text-cyan-300 shadow-sm border border-cyan-500/50'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                    aria-pressed={filterMode === mode}
                  >
                    {mode === 'boxes' && 'AI Detection'}
                    {mode === 'original' && 'Brightfield'}
                    {mode === 'enhanced' && 'Membrane Boost'}
                    {mode === 'darkfield' && 'Darkfield'}
                    {mode === 'split' && 'Split View'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Zone: Primary Optical Controls - Grouped by function */}
          <div className="w-full flex flex-wrap items-center justify-start gap-2">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 px-1">Tools</span>
            {/* Imaging Controls */}
            <div className="flex items-center gap-1.5 bg-slate-900/70 rounded-xl border border-slate-700 p-1.5 overflow-x-auto max-w-full flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setShowReticleGrid(!showReticleGrid)}
                    className={`shrink-0 min-h-10 min-w-10 px-2 flex items-center justify-center gap-1.5 rounded-lg transition cursor-pointer touch-target ${
                  showReticleGrid
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Toggle Concentric Ocular Reticle Graticule"
                aria-pressed={showReticleGrid}
                aria-label="Reticle Grid"
              >
                <Compass className="w-4.5 h-4.5" />
                <span className="text-[11px] font-semibold whitespace-nowrap">Reticle</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMeasuring(!isMeasuring);
                  setIsAddingBox(false);
                  setRulerPoints([]);
                }}
                    className={`shrink-0 min-h-10 min-w-10 px-2 flex items-center justify-center gap-1.5 rounded-lg transition cursor-pointer touch-target ${
                  isMeasuring
                    ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Micrometer Caliper"
                aria-pressed={isMeasuring}
                aria-label="Measurement Tool"
              >
                <Ruler className="w-4.5 h-4.5" />
                <span className="text-[11px] font-semibold whitespace-nowrap">Measure</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEyepieceMask(!isEyepieceMask)}
                    className={`shrink-0 min-h-10 min-w-10 px-2 flex items-center justify-center gap-1.5 rounded-lg transition cursor-pointer touch-target ${
                  isEyepieceMask
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Circular Eyepiece Aperture"
                aria-pressed={isEyepieceMask}
                aria-label="Eyepiece Mask"
              >
                <Sun className="w-4.5 h-4.5" />
                <span className="text-[11px] font-semibold whitespace-nowrap">Eyepiece</span>
              </button>

              <button
                type="button"
                onClick={handleCaptureSnapshot}
                className="shrink-0 min-h-10 min-w-10 px-2 flex items-center justify-center gap-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors touch-target"
                title="Capture Field Photomicrograph"
                aria-label="Capture Snapshot"
              >
                <Camera className="w-4.5 h-4.5" />
                <span className="text-[11px] font-semibold whitespace-nowrap">Capture</span>
              </button>
            </div>

            {/* Mobile Controls Panel Toggle - Only on mobile/tablet */}
            <button
              type="button"
              onClick={() => setShowControlsPanel(!showControlsPanel)}
              className={`lg:hidden flex w-9 h-9 items-center justify-center rounded-lg transition cursor-pointer touch-target ${
                showControlsPanel
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Optical Controls"
              aria-label="Optical Controls"
              aria-expanded={showControlsPanel}
              aria-controls="mobile-controls-panel"
            >
              <SlidersHorizontal className="w-4.5 h-4.5" />
            </button>

            <div className="flex items-center gap-1.5 bg-slate-900/70 rounded-xl border border-slate-800 p-1.5">
              <button
                type="button"
                onClick={() => zoomAroundPoint(zoom - 0.25)}
                className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors touch-target"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <ZoomOut className="w-4.5 h-4.5" />
              </button>
              <div className="flex items-center justify-center px-1.5 text-center">
                <span className="font-mono text-xs text-slate-300 whitespace-nowrap">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <button
                type="button"
                onClick={() => zoomAroundPoint(zoom + 0.25)}
                className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors touch-target"
                title="Zoom In"
                aria-label="Zoom In"
              >
                <ZoomIn className="w-4.5 h-4.5" />
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step="0.05"
                value={zoom}
                onChange={(e) => zoomAroundPoint(Number(e.target.value))}
                className="hidden sm:block w-24 accent-cyan-400 cursor-pointer"
                aria-label="Zoom level"
                title="Adjust zoom level"
              />
              <button
                type="button"
                onClick={resetView}
                className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors touch-target"
                title="Reset All Controls"
                aria-label="Reset View"
              >
                <RotateCcw className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 text-[10px] sm:text-[11px]">
            <div className="flex items-center gap-2 text-slate-400">
              {activeTool === 'label' ? (
                <PlusCircle className="h-3.5 w-3.5 text-cyan-300" />
              ) : activeTool === 'measure' ? (
                <Ruler className="h-3.5 w-3.5 text-amber-300" />
              ) : (
                <LocateFixed className="h-3.5 w-3.5 text-emerald-300" />
              )}
              <span className="uppercase tracking-[0.14em] text-slate-500">Active tool</span>
              <span className="font-semibold text-slate-200">
                {activeTool === 'label' ? 'Label target' : activeTool === 'measure' ? 'Measure field' : 'Inspect field'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <ScanSearch className="h-3.5 w-3.5 text-cyan-400" />
              <span>Wheel / pinch zoom</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">Drag to pan</span>
              <span className="hidden md:inline font-mono text-slate-600">M measure · L label · 0 reset</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Optical Canvas Stage */}
      <div
        ref={containerRef}
        className={`relative w-full flex-none overflow-hidden flex items-center justify-center ${
          imageUrl ? 'py-1' : 'min-h-52'
        }`}
      >
        <div
          ref={viewportRef}
          className="relative w-fit max-w-full overflow-hidden rounded-lg"
          style={{ maxHeight: 'min(78vh, 860px)', isolation: 'isolate' }}
        >
          <div
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
              willChange: 'transform'
            }}
            className={`relative flex w-fit max-w-full items-center justify-center overflow-visible rounded-lg cursor-default select-none ${
              imageUrl ? 'bg-slate-950' : 'bg-transparent'
            }`}
          >
            {/* Empty state placeholder */}
            {!imageObjRef.current || !imageObjRef.current.complete || imageObjRef.current.naturalWidth === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-center">
                <div className="flex flex-col items-center gap-3 text-slate-600">
                  <Camera className="w-12 h-12 opacity-30" />
                  <p className="text-sm font-medium">No slide image loaded</p>
                  <p className="text-xs max-w-xs text-center">Load a specimen image to begin microscopy analysis</p>
                </div>
              </div>
            ) : null}
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
                maxHeight: 'min(78vh, 860px)',
                imageRendering: 'crisp-edges' as const
              }}
              className={`rounded-lg ${
                isMeasuring
                  ? 'cursor-crosshair touch-none'
                  : isAddingBox
                  ? 'cursor-crosshair touch-none'
                  : zoom > 1
                  ? 'cursor-grab active:cursor-grabbing touch-none'
                  : 'cursor-crosshair touch-none'
              }`}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (isAddingBox) {
                    setIsAddingBox(false);
                    setDragStart(null);
                    setDragCurrent(null);
                  } else if (isMeasuring) {
                    setIsMeasuring(false);
                    setRulerPoints([]);
                  }
                }
                if (e.key === 'l' && !isAddingBox && !isMeasuring) {
                  setIsAddingBox(true);
                  setIsMeasuring(false);
                  setDragStart(null);
                  setDragCurrent(null);
                }
              }}
              tabIndex={0}
            />
          </div>
        </div>

        {/* Optical Scanning Sweep Animation - Centered over canvas stage */}
        {isScanning && (
          <div className="absolute inset-4 pointer-events-none overflow-hidden z-20">
            <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-[0.5px]" />
            <div
              className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_18px_#22d3ee]"
              style={{ animation: 'scanLaser 1.4s ease-in-out infinite alternate' }}
            />
            <div className="absolute top-4 inset-x-0 flex items-center justify-center">
              <div className="bg-slate-950/90 border border-cyan-500/60 px-4 py-2 rounded-xl text-cyan-300 font-mono text-xs flex items-center gap-2 shadow-2xl">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                <span>LENZIAI SERVERLESS INFERENCE ACTIVE · EXTRACTING MORPHOLOGY</span>
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
        <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 max-w-[calc(100%-1rem)] bg-slate-900/90 backdrop-blur-md border border-slate-700 px-3 sm:px-4 py-2 rounded-xl text-[10px] sm:text-xs font-mono text-slate-300 pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1 shadow-lg">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
            STAGE: X: {stageVernierX}mm · Y: {stageVernierY}mm
          </span>
          {mouseCoords && (
            <>
              <span className="text-slate-700 dark:text-slate-600">|</span>
              <span>PX: ({Math.round(mouseCoords.x)}, {Math.round(mouseCoords.y)})</span>
            </>
          )}
          {isMeasuring && rulerPoints.length === 1 && (
            <span className="text-amber-400 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
              Click second point to measure
            </span>
          )}
        </div>

        {/* Consolidated Right Control Panel */}
        <div className="microscope-optical-dock absolute right-3 top-3 bottom-3 hidden lg:flex flex-col z-10 gap-3">
          <button
            type="button"
            onClick={() => setShowRightPanel(!showRightPanel)}
            className={`w-10 h-10 flex items-center justify-center rounded-xl shadow-lg border transition-colors ${
              showRightPanel
                ? 'bg-cyan-500/30 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={showRightPanel ? 'Hide controls panel' : 'Show controls panel'}
            aria-label="Toggle controls panel"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>

          {showRightPanel && (
            <div className="flex-1 w-64 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
              {/* Panel Header */}
              <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Optical Controls</span>
                <span className="text-[10px] font-mono text-cyan-400">{objective}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {/* Iris Aperture */}
                <div className="bg-slate-950/80 rounded-lg p-2.5 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Iris</span>
                    <span className="text-xs font-mono text-slate-300">{irisAperture}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={irisAperture}
                    onChange={e => setIrisAperture(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 accent-cyan-500 cursor-pointer"
                    title="Condenser Iris Diaphragm Aperture"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                    <span>20%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Fine Focus */}
                <div className="bg-slate-950/80 rounded-lg p-2.5 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Focus</span>
                    <button
                      type="button"
                      onClick={() => setFocusOffset(0)}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                    >
                      {focusOffset === 0 ? '0µm' : `${focusOffset > 0 ? '+' : ''}${focusOffset}µm`}
                    </button>
                  </div>
                  <input
                    type="range"
                    min="-3"
                    max="3"
                    step="0.5"
                    value={focusOffset}
                    onChange={e => setFocusOffset(parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-cyan-500 cursor-pointer"
                    title="Micrometer Fine Focus Wheel"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                    <span>-3µm</span>
                    <span>+3µm</span>
                  </div>
                </div>

                {/* Light Filter */}
                <div className="bg-slate-950/80 rounded-lg p-2.5 border border-slate-800">
                  <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider block mb-2">Light Filter</span>
                  <div className="space-y-1">
                    {(['daylight', 'halogen', 'daylight_blue', 'fluorescence_filter'] as LightFilter[]).map(filter => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setLightFilter(filter)}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs transition cursor-pointer ${
                          lightFilter === filter
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent'
                        }`}
                        aria-pressed={lightFilter === filter}
                      >
                        {filter === 'daylight' && 'Daylight'}
                        {filter === 'halogen' && 'Halogen'}
                        {filter === 'daylight_blue' && 'Daylight Blue'}
                        {filter === 'fluorescence_filter' && 'Fluorescence'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mechanical Stage */}
                <div className="bg-slate-950/80 rounded-lg p-2.5 border border-slate-800">
                  <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider block mb-2">Mechanical Stage</span>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => translateMechanicalStage(0, -0.4)}
                      className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                      title="Translate Stage Up"
                      aria-label="Stage Up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => translateMechanicalStage(-0.4, 0)}
                        className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                        title="Translate Stage Left"
                        aria-label="Stage Left"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <div className="bg-slate-900 border border-slate-700 px-2 py-1 rounded text-center min-w-[60px]">
                        <div className="text-[9px] font-mono text-cyan-400 font-bold">STAGE</div>
                        <div className="text-[8px] text-slate-500">X:{stageVernierX} Y:{stageVernierY}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => translateMechanicalStage(0.4, 0)}
                        className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                        title="Translate Stage Right"
                        aria-label="Stage Right"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => translateMechanicalStage(0, 0.4)}
                      className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                      title="Translate Stage Down"
                      aria-label="Stage Down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Slide Navigation */}
                <div className="bg-slate-950/80 rounded-lg p-2.5 border border-slate-800">
                  <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider block mb-2">Specimen</span>
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={onPreviousSlide}
                      disabled={!canSwitchSlides}
                      aria-label="Previous specimen image"
                      title="Previous specimen image"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span className="text-xs">Prev</span>
                    </button>
                    <div className="px-2 text-center flex-1">
                      <div className="text-[9px] font-mono text-cyan-300 font-semibold truncate" title={slideNavigationLabel}>
                        {slideNavigationLabel}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onNextSlide}
                      disabled={!canSwitchSlides}
                      aria-label="Next specimen image"
                      title="Next specimen image"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className="text-xs">Next</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Add Manual Target Toolbar */}
        <div className="absolute top-3 left-3 right-3 sm:right-auto sm:top-4 sm:left-4 max-w-[calc(100%-1.5rem)] bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-lg overflow-hidden">
          {!isAddingBox ? (
            <button
              type="button"
              disabled={isSavingLabel}
              onClick={() => {
                setIsAddingBox(true);
                setIsMeasuring(false);
                setDragStart(null);
                setDragCurrent(null);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-wait text-white font-semibold text-sm transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isSavingLabel ? 'Saving label…' : 'Label Cell / Organism'}</span>
              <span className="text-[10px] bg-cyan-800/40 px-1.5 py-0.5 rounded">L</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-cyan-300 font-semibold">{isSavingLabel ? 'Saving label…' : 'Select & Drag'}</span>
                <select
                  value={selectedClassToAdd}
                  onChange={e => setSelectedClassToAdd(e.target.value)}
                  className="bg-slate-800 text-slate-100 border border-slate-700 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  {availableClasses.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={String(internalConfidence)}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setInternalConfidence(val);
                    if (setManualConfidenceProp) setManualConfidenceProp(val);
                  }}
                  className="w-16 bg-slate-800 text-slate-100 border border-slate-700 text-xs font-mono rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  aria-label="Confidence"
                  title="Confidence (0–1)"
                />
                <input
                  type="text"
                  value={internalNote}
                  onChange={e => {
                    setInternalNote(e.target.value);
                    if (setManualNoteProp) setManualNoteProp(e.target.value);
                  }}
                  className="w-28 bg-slate-800 text-slate-300 border border-slate-700 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="Note..."
                  aria-label="Detection note"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">Esc</span>
                <button
                  type="button"
                  onClick={() => setIsAddingBox(false)}
                  className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {snapshotFeedback && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-950/95 border border-emerald-700 text-emerald-300 text-sm py-2 px-4 rounded-xl text-center font-medium shadow-xl z-20">
            ✓ Field Snapshot Downloaded
          </div>
        )}

        {/* Selected Box Quick Inspector Card */}
        {selectedDetection && (
          <div className="absolute top-16 sm:top-4 right-3 lg:right-64 bg-slate-900/98 backdrop-blur-md border border-cyan-500/40 p-3 sm:p-4 rounded-xl shadow-2xl w-[min(20rem,calc(100%-1.5rem))] text-slate-200 text-sm z-10">
            <div className="flex items-start justify-between border-b border-slate-800 pb-2.5 mb-2.5">
              <div>
                <span className="font-semibold text-cyan-300 text-sm block mb-1">
                  {selectedDetection.class}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Confidence: {(selectedDetection.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold font-mono ${
                  selectedDetection.confirmed
                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
                    : 'bg-amber-950/70 text-amber-300 border border-amber-800'
                }`}
              >
                {selectedDetection.confirmed ? '✓ Confirmed' : 'Pending Review'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-3 font-mono text-xs text-slate-300">
              <div className="bg-slate-950/60 px-2.5 py-1.5 rounded-lg">
                <div className="text-[9px] text-slate-500 mb-0.5">SIZE</div>
                <div>{(selectedDetection.width / pxPerMicron).toFixed(1)} × {(selectedDetection.height / pxPerMicron).toFixed(1)} µm</div>
              </div>
              <div className="bg-slate-950/60 px-2.5 py-1.5 rounded-lg">
                <div className="text-[9px] text-slate-500 mb-0.5">POSITION</div>
                <div>({Math.round(selectedDetection.x)}, {Math.round(selectedDetection.y)})</div>
              </div>
            </div>

            {selectedDetection.note && (
              <p className="text-slate-300 text-xs bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 mb-3">
                "{selectedDetection.note}"
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleConfirm?.(selectedDetection.id)}
                className={`flex-1 py-2 px-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  selectedDetection.confirmed
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                <span>{selectedDetection.confirmed ? 'Unconfirm' : 'Confirm'}</span>
              </button>
              <button
                type="button"
                onClick={() => onRejectDetection?.(selectedDetection.id)}
                className="py-2 px-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 hover:bg-rose-900/80 font-semibold text-sm flex items-center gap-1.5 transition cursor-pointer"
                title="Reject false positive"
              >
                <Trash2 className="w-4 h-4" />
                <span>Reject</span>
              </button>
            </div>
          </div>
        )}
        
        {/* Mobile Controls Bottom Sheet */}
        {showControlsPanel && (
          <div
            id="mobile-controls-panel"
            className="lg:hidden fixed inset-x-0 bottom-0 z-40 animate-slide-in"
            role="dialog"
            aria-modal="true"
            aria-label="Optical Controls"
          >
            <div className="relative z-10 bg-slate-900 border-t border-slate-700 rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-center pt-3 pb-2">
                <div className="w-12 h-1 bg-slate-700 rounded-full" />
              </div>
              <div className="px-4 pb-6 space-y-3">
                {/* Quick Header */}
                <div className="flex items-center justify-between px-2 py-2 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200">Microscope Controls</h3>
                  <span className="text-xs font-mono text-cyan-400">{objective} • {totalMagnification}</span>
                </div>
                
                {/* Iris */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-cyan-400">CONDENSER IRIS</span>
                    <span className="font-mono text-sm text-slate-300">{irisAperture}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={irisAperture}
                    onChange={e => setIrisAperture(parseInt(e.target.value, 10))}
                    className="w-full h-2 accent-cyan-500 cursor-pointer"
                  />
                </div>
                
                {/* Focus */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-cyan-400">FINE FOCUS</span>
                    <span className="font-mono text-sm text-slate-300">
                      {focusOffset === 0 ? '0µm' : `${focusOffset > 0 ? '+' : ''}${focusOffset}µm`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-3"
                    max="3"
                    step="0.5"
                    value={focusOffset}
                    onChange={e => setFocusOffset(parseFloat(e.target.value))}
                    className="w-full h-2 accent-cyan-500 cursor-pointer mb-2"
                  />
                  <button
                    type="button"
                    onClick={() => setFocusOffset(0)}
                    className="w-full py-2 px-3 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium cursor-pointer"
                  >
                    Reset Focus
                  </button>
                </div>
                
                {/* Light Filter */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                  <span className="text-xs font-semibold text-cyan-400 block mb-2">LIGHT FILTER</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['daylight', 'halogen', 'daylight_blue', 'fluorescence_filter'] as LightFilter[]).map(filter => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setLightFilter(filter)}
                        className={`py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
                          lightFilter === filter
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                        }`}
                      >
                        {filter === 'daylight' && 'Daylight'}
                        {filter === 'halogen' && 'Halogen'}
                        {filter === 'daylight_blue' && 'Daylight Blue'}
                        {filter === 'fluorescence_filter' && 'Fluorescence'}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Mechanical Stage */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                  <span className="text-xs font-semibold text-cyan-400 block mb-2">MECHANICAL STAGE</span>
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => translateMechanicalStage(0, -0.4)}
                      className="p-2.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer touch-target"
                    >
                      <ArrowUp className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => translateMechanicalStage(-0.4, 0)}
                        className="p-2.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer touch-target"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-center">
                        <div className="text-[10px] font-mono text-cyan-400 font-bold">STAGE</div>
                        <div className="text-[9px] text-slate-400">X: {stageVernierX}mm · Y: {stageVernierY}mm</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => translateMechanicalStage(0.4, 0)}
                        className="p-2.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer touch-target"
                      >
                        <ArrowRight className="w-5 h-5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => translateMechanicalStage(0, 0.4)}
                      className="p-2.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer touch-target"
                    >
                      <ArrowDown className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => setShowControlsPanel(false)}
                  className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm cursor-pointer touch-target"
                >
                  Apply Settings
                </button>
              </div>
            </div>
            <div className="fixed inset-0 bg-black/70 lg:hidden z-0" onClick={() => setShowControlsPanel(false)} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
};

// Scan progress and elapsed-time updates happen in the parent workspace. The
// optical canvas only needs to repaint when its actual image/review props
// change, so memoization keeps long tile scans from doing unnecessary canvas
// work on every progress tick.
export const MicroscopeViewer = React.memo(MicroscopeViewerView);

