function canvasSize(format: string) {
  if (format === "9:16") return { width: 480, height: 854 };
  if (format === "1:1") return { width: 480, height: 480 };
  return { width: 854, height: 480 };
}

function loadVideo(video: HTMLVideoElement, src: string) {
  return new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("No se pudo cargar un segmento del video."));
    video.src = src;
    video.load();
  });
}

const audioVideoMimeTypes = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
];

export function supportsVideoAudioAssembly() {
  if (typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") return false;
  return audioVideoMimeTypes.some((mime) => MediaRecorder.isTypeSupported(mime));
}

export async function assembleVideoSequence(urls: string[], format: string, narration: Blob) {
  if (typeof MediaRecorder === "undefined" || urls.length === 0) {
    throw new Error("Este navegador no puede ensamblar los segmentos.");
  }
  if (typeof AudioContext === "undefined") {
    throw new Error("Este navegador no puede combinar el sonido y la narración del video.");
  }

  const { width, height } = canvasSize(format);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar el ensamblado.");

  const video = document.createElement("video");
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  document.body.append(video);

  const audioContext = new AudioContext();
  const canvasStream = canvas.captureStream(24);
  let audioDestination: MediaStreamAudioDestinationNode | null = null;
  let mediaElementSource: MediaElementAudioSourceNode | null = null;
  let narrationSource: AudioBufferSourceNode | null = null;
  let narrationGain: GainNode | null = null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let finished: Promise<Blob> | null = null;
  let animationFrame = 0;
  let ambientGain: GainNode | null = null;
  const draw = () => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
      const drawWidth = video.videoWidth * scale;
      const drawHeight = video.videoHeight * scale;
      context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    }
    animationFrame = requestAnimationFrame(draw);
  };

  try {
    const narrationBuffer = await audioContext.decodeAudioData(await narration.arrayBuffer());
    audioDestination = audioContext.createMediaStreamDestination();
    narrationSource = audioContext.createBufferSource();
    narrationGain = audioContext.createGain();
    narrationGain.gain.value = 1;
    narrationSource.buffer = narrationBuffer;
    narrationSource.connect(narrationGain);
    narrationGain.connect(audioDestination);
    mediaElementSource = audioContext.createMediaElementSource(video);
    ambientGain = audioContext.createGain();
    ambientGain.gain.value = 0.25;
    mediaElementSource.connect(ambientGain);
    ambientGain.connect(audioDestination);
    stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks(),
    ]);

    const mimeType = audioVideoMimeTypes.find((mime) => MediaRecorder.isTypeSupported(mime));
    if (!mimeType) throw new Error("Este navegador no tiene un formato de video con audio compatible para guardar.");

    const activeRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 650_000 });
    recorder = activeRecorder;
    const chunks: Blob[] = [];
    activeRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    finished = new Promise<Blob>((resolve, reject) => {
      activeRecorder.onstop = () => resolve(new Blob(chunks, { type: activeRecorder.mimeType }));
      activeRecorder.onerror = () => reject(new Error("No se pudo ensamblar el archivo de video."));
    });

    await loadVideo(video, urls[0]);
    await audioContext.resume();
    if (audioContext.state !== "running") throw new Error("No se pudo iniciar el mezclador de audio del video.");
    narrationSource.start();
    activeRecorder.start(1000);
    draw();
    for (const [index, url] of urls.entries()) {
      if (index > 0) await loadVideo(video, url);
      await video.play();
      await new Promise<void>((resolve, reject) => {
        video.onended = () => resolve();
        video.onerror = () => reject(new Error("Se interrumpió la reproducción de un segmento."));
      });
    }
    recorder.stop();
    return await finished;
  } catch (error) {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    await finished?.catch(() => undefined);
    throw error;
  } finally {
    cancelAnimationFrame(animationFrame);
    canvasStream.getTracks().forEach((track) => track.stop());
    stream?.getTracks().forEach((track) => track.stop());
    audioDestination?.stream.getTracks().forEach((track) => track.stop());
    mediaElementSource?.disconnect();
    ambientGain?.disconnect();
    narrationSource?.disconnect();
    narrationGain?.disconnect();
    await audioContext.close();
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
}
