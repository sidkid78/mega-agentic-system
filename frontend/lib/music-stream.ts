/**
 * Gapless playback of the Lyria RealTime PCM stream.
 *
 * The backend forwards raw audio as binary WebSocket frames: 16-bit signed
 * little-endian PCM, interleaved stereo, 48 kHz. This player decodes each chunk
 * into a Web Audio `AudioBuffer` and schedules it back-to-back so playback is
 * continuous. A small lead buffer absorbs network jitter before audio starts.
 */

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const INITIAL_BUFFER_SEC = 0.25; // lead time before first chunk plays

export interface PcmStreamCallbacks {
  /** Seconds of audio currently scheduled ahead of the playhead. */
  onBufferedChange?: (secondsAhead: number) => void;
  /** Fires once, the first time audio actually starts playing. */
  onStart?: () => void;
}

export class PcmStreamPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private nextTime = 0;
  private started = false;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly callbacks: PcmStreamCallbacks;

  constructor(callbacks: PcmStreamCallbacks = {}) {
    this.callbacks = callbacks;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor({ sampleRate: SAMPLE_RATE });
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
      this.nextTime = 0;
    }
    return this.ctx;
  }

  /** Resume the context (call from a user gesture to satisfy autoplay policy). */
  async resume(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
  }

  setVolume(value: number): void {
    if (this.gain) this.gain.gain.value = value;
  }

  /** Decode and schedule one raw PCM chunk. */
  enqueue(chunk: ArrayBuffer): void {
    const ctx = this.ensureContext();
    const gain = this.gain;
    if (!gain) return;

    // Guard against odd byte lengths that would break Int16 alignment.
    const usableBytes = chunk.byteLength - (chunk.byteLength % (2 * CHANNELS));
    if (usableBytes <= 0) return;
    const pcm = new Int16Array(chunk, 0, usableBytes / 2);

    const frames = pcm.length / CHANNELS;
    const buffer = ctx.createBuffer(CHANNELS, frames, SAMPLE_RATE);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < frames; i++) {
      left[i] = pcm[i * CHANNELS] / 32768;
      right[i] = pcm[i * CHANNELS + 1] / 32768;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);

    // If we have fallen behind (underrun), restart the lead buffer.
    const now = ctx.currentTime;
    if (this.nextTime < now + 0.02) {
      this.nextTime = now + INITIAL_BUFFER_SEC;
    }

    source.start(this.nextTime);
    this.nextTime += buffer.duration;

    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
    };

    if (!this.started) {
      this.started = true;
      this.callbacks.onStart?.();
    }
    this.callbacks.onBufferedChange?.(Math.max(0, this.nextTime - ctx.currentTime));
  }

  /** Stop all scheduled audio but keep the context alive for reuse. */
  flush(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    this.started = false;
    if (this.ctx) this.nextTime = this.ctx.currentTime;
    this.callbacks.onBufferedChange?.(0);
  }

  /** Tear everything down. */
  async close(): Promise<void> {
    this.flush();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        // ignore
      }
      this.ctx = null;
      this.gain = null;
    }
  }
}
