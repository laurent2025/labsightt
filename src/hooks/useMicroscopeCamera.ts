import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * USB/DCC cameras attached to a microscope commonly report labels with these
 * vendor or protocol keywords. Used to prefer such a device over the laptop's
 * built-in webcam when auto-selecting the camera source.
 */
const MICROSCOPE_DEVICE_HINT =
  /microscope|dpc|toupcam|usb\s?camera|wc-am|hid|wkam|fmd|linkham|amscope|svan|fourier|celesco|global camera|dmk|quickcam|tcel|teledyne|chroma|zycam/i;

function friendlyCameraError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? '';
  const detail = err instanceof Error ? err.message : String(err);
  switch (name) {
    case 'NotAllowedError':
      return 'Camera permission was denied. Allow camera access for this site in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found. Connect the microscope camera (USB/DCC) to this device and try again.';
    case 'NotReadableError':
      return 'The camera is in use by another application. Close it there (manufacturer software, Zoom, OBS, …) and try again.';
    case 'SecurityError':
      return 'Camera capture requires a secure context (HTTPS or localhost).';
    default:
      return detail ? `Camera access failed: ${detail}` : 'Camera access failed.';
  }
}

/**
 * Shared camera capture hook for "Capture from Microscope".
 *
 * - Opens the browser camera directly (getUserMedia) with a 1080p ideal
 *   resolution constraint.
 * - Enumerates videoinput devices and auto-selects a device that looks like a
 *   microscope camera (DCC/USB) when one is available; falls back to the first
 *   device otherwise. The operator can still pick any device from the modal.
 * - Re-enumerates after the permission prompt (labels are blank before it)
 *   and watches for hot-plugged cameras while the modal is open.
 * - Retries without the exact deviceId constraint if the preferred device is
 *   busy or was disconnected.
 */
export function useMicroscopeCamera() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('default');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openingRef = useRef(false);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const refreshDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const video = all.filter(d => d.kind === 'videoinput');
      setDevices(video);
      return video;
    } catch {
      return [];
    }
  }, []);

  /**
   * @returns the error message if the camera could not be opened, otherwise
   * null. With `silentOnError`, a failure does not open the modal (used for
   * the workstation's auto-open, where the caller surfaces the message).
   */
  const openCamera = useCallback(
    async (requestedDeviceId?: string, options?: { silentOnError?: boolean }): Promise<string | null> => {
      if (openingRef.current) return error;
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        const message = 'Camera capture is not supported in this browser. Use a modern browser over HTTPS or localhost.';
        setError(message);
        if (!options?.silentOnError) setOpen(true);
        return message;
      }
      openingRef.current = true;
      setStarting(true);
      setError(null);
      let preferred = requestedDeviceId ?? deviceId;
      try {
        const video = await refreshDevices();
        // Before the permission prompt, enumerateDevices() reports empty
        // deviceIds — those cannot be constrained, so ignore them.
        const valid = video.filter(d => d.deviceId);
        if (valid.length > 0 && (preferred === 'default' || !valid.some(d => d.deviceId === preferred))) {
          const pick = valid.find(d => d.label && MICROSCOPE_DEVICE_HINT.test(d.label)) ?? valid[0];
          preferred = pick.deviceId;
        }
        setDeviceId(preferred || 'default');

        const wantsDevice = preferred && preferred !== 'default';
        let s: MediaStream;
        try {
          s = await navigator.mediaDevices.getUserMedia({
            video: {
              ...(wantsDevice ? { deviceId: { exact: preferred } } : {}),
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            },
            audio: false
          });
        } catch {
          // Preferred device may be busy or gone — fall back to the default.
          s = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false
          });
          preferred = 'default';
          setDeviceId('default');
        }
        stopTracks();
        streamRef.current = s;
        setStream(s);
        setOpen(true);
        // Device labels only appear after permission was granted.
        void refreshDevices();
        return null;
      } catch (err) {
        const message = friendlyCameraError(err);
        setError(message);
        if (!options?.silentOnError) setOpen(true);
        return message;
      } finally {
        openingRef.current = false;
        setStarting(false);
      }
    },
    [deviceId, refreshDevices, stopTracks]
  );

  const close = useCallback(() => {
    stopTracks();
    setStream(null);
    setOpen(false);
  }, [stopTracks]);

  const switchDevice = useCallback(
    (id: string) => {
      void openCamera(id);
    },
    [openCamera]
  );

  // The <video> mounts after the stream resolves, so attach on render.
  useEffect(() => {
    if (open && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [open, stream]);

  // Watch for cameras plugged/unplugged while the modal is open.
  useEffect(() => {
    if (!open || typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    const onDeviceChange = () => {
      void refreshDevices();
    };
    navigator.mediaDevices.addEventListener?.('devicechange', onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', onDeviceChange);
  }, [open, refreshDevices]);

  // Release the camera when the component unmounts.
  useEffect(() => {
    return () => {
      stopTracks();
    };
  }, [stopTracks]);

  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  }, []);

  return { open, error, starting, devices, deviceId, stream, videoRef, openCamera, close, switchDevice, capture };
}
