/**
 * Browser audio helpers for the Voices tab.
 *
 * Voice replication recommends 24 kHz mono 16-bit WAV. MediaRecorder produces
 * webm/ogg, so recordings (and uploaded files, when the browser can decode
 * them) are resampled and re-encoded here before upload.
 */

const TARGET_RATE = 24000

/** Encode mono float samples as a 16-bit PCM WAV blob. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataLength = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeAscii(0, "RIFF")
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(8, "WAVE")
  writeAscii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, "data")
  view.setUint32(40, dataLength, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: "audio/wav" })
}

/** Decode any browser-playable audio and return it as 24 kHz mono WAV, with its length. */
export async function toWav24kMono(input: Blob): Promise<{ wav: Blob; seconds: number }> {
  const bytes = await input.arrayBuffer()
  const decoder = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await decoder.decodeAudioData(bytes)
  } finally {
    void decoder.close()
  }
  const frames = Math.ceil(decoded.duration * TARGET_RATE)
  const offline = new OfflineAudioContext(1, Math.max(1, frames), TARGET_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded // multi-channel input is down-mixed to the mono destination
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return { wav: encodeWav(rendered.getChannelData(0), TARGET_RATE), seconds: decoded.duration }
}

/** Start recording from the microphone; call stop() for the captured audio. */
export async function startRecording(): Promise<{ stop: () => Promise<Blob>; cancel: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const release = () => stream.getTracks().forEach((t) => t.stop())
  recorder.start()
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          release()
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }))
        }
        recorder.stop()
      }),
    cancel: () => {
      recorder.onstop = release
      if (recorder.state !== "inactive") recorder.stop()
      else release()
    },
  }
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}
