// Browsers cap the number of AudioContexts a page may create (Chrome: ~6), so the
// app shares a single one instead of creating a new one per notification.
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function playChime(kind: "incoming" | "outgoing") {
  if (typeof window === "undefined" || localStorage.getItem("settings-notifications-sound") === "false") return;
  const audio = getAudioContext();
  if (!audio) return;

  const now = audio.currentTime;
  const master = audio.createGain();
  master.gain.setValueAtTime(0.5, now);
  master.connect(audio.destination);

  const tone = (freq: number, start: number, length: number, peak: number) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + start);
    gain.gain.setValueAtTime(peak, now + start);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + length);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + start);
    osc.stop(now + start + length + 0.02);
  };

  if (kind === "incoming") {
    tone(784, 0, 0.18, 0.5);
    tone(1047, 0.08, 0.24, 0.4);
  } else {
    tone(520, 0, 0.1, 0.3);
  }
}
