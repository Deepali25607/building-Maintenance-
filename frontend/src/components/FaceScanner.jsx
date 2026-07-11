import { useEffect, useRef, useState } from "react";
import { loadFaceApi, detectFace, captureSnapshot } from "../lib/faceapi.js";

/**
 * Live webcam face scanner. Loads the on-device recognition engine, opens the
 * camera and runs a detection loop; every time a face is confidently in frame
 * it calls onFace({ descriptor, score, snapshot }) where snapshot() resolves to
 * a JPEG Blob of the current frame.
 *
 * Used in two places: staff face ENROLLMENT (collect samples) and the gate
 * KIOSK (recognize + auto punch). `paused` freezes detection (camera stays on)
 * while the parent is busy processing a match.
 */
export default function FaceScanner({ onFace, paused = false, className = "" }) {
  const videoRef = useRef(null);
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [faceInFrame, setFaceInFrame] = useState(false);

  // Refs so the detection loop always sees the latest values without rebinding.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onFaceRef = useRef(onFace);
  onFaceRef.current = onFace;

  useEffect(() => {
    let alive = true;
    let stream = null;
    let timer = null;

    async function start() {
      try {
        const faceapi = await loadFaceApi();
        if (!alive) return;

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setPhase("ready");

        let detecting = false;
        const tick = async () => {
          if (!alive) return;
          if (!detecting && !pausedRef.current) {
            detecting = true;
            try {
              const det = await detectFace(faceapi, videoRef.current);
              if (!alive) return;
              setFaceInFrame(!!det);
              if (det && !pausedRef.current) {
                onFaceRef.current?.({ ...det, snapshot: () => captureSnapshot(videoRef.current) });
              }
            } catch { /* transient detection failure — keep looping */ }
            detecting = false;
          }
          timer = setTimeout(tick, 600);
        };
        tick();
      } catch (e) {
        if (!alive) return;
        setPhase("error");
        setError(
          e?.name === "NotAllowedError"
            ? "Camera access was denied — allow camera permission and try again."
            : e?.message || "Could not start the camera."
        );
      }
    }

    start();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className={`relative rounded-xl overflow-hidden bg-black ${className}`}>
      {/* Mirrored like a selfie camera so movement feels natural */}
      <video ref={videoRef} muted playsInline className="w-full aspect-[4/3] object-cover -scale-x-100" />

      {phase === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white text-sm">
          <div className="animate-pulse text-3xl">🤖</div>
          Loading AI face engine…
          <div className="text-[11px] opacity-70">first time takes a few seconds</div>
        </div>
      )}
      {phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-sm p-4 text-center">
          ⚠ {error}
        </div>
      )}
      {phase === "ready" && (
        <div className={`absolute inset-4 rounded-xl border-2 pointer-events-none transition-colors ${
          faceInFrame ? "border-emerald-400" : "border-white/30"
        }`} />
      )}
      {phase === "ready" && (
        <div className="absolute bottom-2 inset-x-0 text-center text-[11px] text-white/80">
          {faceInFrame ? "Face detected" : "Position the face inside the frame"}
        </div>
      )}
    </div>
  );
}
