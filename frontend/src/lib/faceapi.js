// Lazy loader for the in-browser face recognition engine (@vladmandic/face-api,
// a maintained face-api.js fork with TensorFlow.js bundled). The library (~3MB)
// and model weights (~7MB) are pulled from CDN only when a face feature is
// actually opened — the rest of the app never pays this cost. Detection and
// descriptor computation all happen on-device; only the resulting 128-number
// vector is ever sent to our backend.
const CDN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15";

let loadPromise = null;

export function loadFaceApi() {
  if (typeof window !== "undefined" && window.faceapi?.__modelsLoaded) {
    return Promise.resolve(window.faceapi);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.faceapi) return resolve();
    const s = document.createElement("script");
    s.src = `${CDN}/dist/face-api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the face recognition engine — check your internet connection."));
    document.head.appendChild(s);
  })
    .then(async () => {
      const faceapi = window.faceapi;
      if (!faceapi) throw new Error("Face recognition engine failed to initialize.");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(`${CDN}/model`),
        faceapi.nets.faceLandmark68Net.loadFromUri(`${CDN}/model`),
        faceapi.nets.faceRecognitionNet.loadFromUri(`${CDN}/model`),
      ]);
      faceapi.__modelsLoaded = true;
      return faceapi;
    })
    .catch((e) => {
      loadPromise = null; // allow a retry after a transient network failure
      throw e;
    });

  return loadPromise;
}

// Detect the most prominent face in a <video> frame and compute its descriptor.
// Returns { descriptor: number[128], score } or null when no face is in frame.
export async function detectFace(faceapi, video) {
  if (!video || video.readyState < 2) return null;
  const det = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) return null;
  return { descriptor: Array.from(det.descriptor), score: det.detection.score };
}

// Element-wise mean of several descriptors — enrollment averages a few samples
// so the stored vector is robust to pose/lighting of any single frame.
export function averageDescriptors(samples) {
  if (!samples.length) return null;
  const out = new Array(128).fill(0);
  for (const s of samples) for (let i = 0; i < 128; i++) out[i] += s[i];
  return out.map((v) => v / samples.length);
}

// JPEG snapshot of the current video frame (used as the staff profile photo).
export function captureSnapshot(video) {
  return new Promise((resolve) => {
    const size = 480;
    const canvas = document.createElement("canvas");
    const vw = video.videoWidth || size;
    const vh = video.videoHeight || size;
    const scale = size / Math.max(vw, vh);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
  });
}
