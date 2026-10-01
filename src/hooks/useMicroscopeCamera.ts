import { useCallback, useEffect, useRef, useState } from 'react';
import { playShutterSnapshot } from '../lib/audioOpticalFeedback';

/**
 * Microscope camera capture for the browser (WebRTC getUserMedia).
 *
 * Shared by the accession modal and the microscopy workspace so both offer the
 * same behaviour: device selection, live preview, capture-with-review, retake,
 * and actionable error messages. The captured frame is returned as a JPEG
 * data URL; no image leaves the browser until the caller submits it.
 */
export interface MicroscopeCamera {
  modalOpen: boolean;
  /** Available video input devices (microscopes usually appear here). */
  devices: MediaDeviceInfo[];
  activeDeviceId: string | null;
  /** JPEG data URL of the last captured frame, null while live. */
  capturedFrame: string | null;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  open: () => Promise<void>;
  close: () => void;
  selectDevice: (deviceId: string) => void;
  capture: () => void;
  /** Clears the frame and returns to the live view (keeps the stream). */
  retake: () => void;
  /** Stops the camera and closes the modal. */
  confirmAndClose: () => void;
}

function describeCameraError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access for this site in the browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found. Connect the microscope camera (USB), check the cable, and try again.';
    case 'NotReadableError':
      return 'The camera is in use by another application. Close the other application and try again.';
    case 'AbortError':
      return 'The camera request was cancelled.';
    default:
      return err instanceof Error ? `Camera error: ${err.message}` : 'Camera error. Check the connection and try again.';
  }
}

export function useMicroscopeCamera(): MicroscopeCamera {
  const [modalOpen, setModalOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startingRef = useRef(false);

  const stopTracks = useCallback((s: MediaStream | null) => {
    s?.getTracks().forEach(track => track.stop());
  }, []);

  const startStream = useCallback(async (deviceId: string | null) => {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { ideal: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      stopTracks(stream);
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => undefined);
      }
      // Device labels are only revealed after permission is granted.
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter(d => d.kind === 'videoinput');
      setDevices(cams);
      if (!deviceId && cams.length) setActiveDeviceId(cams[0].deviceId || null);
    } catch (err) {
      setError(describeCameraError(err));
    } finally {
      startingRef.current = false;
    }
  }, [stream, stopTracks]);

  const open = useCallback(async () => {
    setCapturedFrame(null);
    setError(null);
    setModalOpen(true);
  }, []);

  // Start the stream once the modal (and its <video>) is mounted.
  useEffect(() => {
    if (modalOpen) {
      void startStream(activeDeviceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  const close = useCallback(() => {
    stopTracks(stream);
    setStream(null);
    setModalOpen(false);
  }, [stream, stopTracks]);

  const selectDevice = useCallback((deviceId: string) => {
    setActiveDeviceId(deviceId);
    void startStream(deviceId);
  }, [startStream]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    playShutterSnapshot();
    setCapturedFrame(canvas.toDataURL('image/jpeg', 0.92));
  }, []);

  const retake = useCallback(() => {
    setCapturedFrame(null);
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  const confirmAndClose = useCallback(() => {
    close();
  }, [close]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => stopTracks(stream);
  }, [stream, stopTracks]);

  return {
    modalOpen,
    devices,
    activeDeviceId,
    capturedFrame,
    error,
    videoRef,
    open,
    close,
    selectDevice,
    capture,
    retake,
    confirmAndClose
  };
}
