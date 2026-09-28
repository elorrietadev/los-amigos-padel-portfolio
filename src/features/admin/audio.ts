// Aviso sonoro de "nueva reserva" — puerto de admin.html:269-333 (Web Audio
// API, sin <audio>/mp3, para evitar el bloqueo de autoplay de los navegadores
// y sonar limpio sin depender de un asset). Independiente de reservas/UI a
// propósito: lo consumen tanto AdminApp (desbloqueo en la primera interacción)
// como AdminShell (reproducirAviso ante un INSERT de Realtime), sin acoplar
// ninguno de los dos al dominio del otro.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

// admin.html:283-297 — hay que llamarla DENTRO de un gesto directo del
// usuario (click/touch/key), si no iOS deja el audio mudo para siempre en esa
// sesión sin importar cuántos resume() se hagan después.
export function desbloquearAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Sin buffer vacío no hay desbloqueo, pero tampoco hay nada que romper.
  }
}

// admin.html:299-336 — tres tonos programados con el reloj exacto de la
// placa de audio (sin setTimeout, para que no se desalineen bajo carga).
export function reproducirAviso(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const notas = [
      { freq: 659.25, timeOffset: 0, dur: 0.4 },
      { freq: 830.61, timeOffset: 0.15, dur: 0.4 },
      { freq: 987.77, timeOffset: 0.3, dur: 0.7 },
    ];

    notas.forEach((n) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = n.freq;

      const startTime = now + n.timeOffset;
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, startTime + n.dur);

      o.connect(g);
      g.connect(ctx.destination);
      o.start(startTime);
      o.stop(startTime + n.dur);
    });
  } catch {
    // Sin sonido no se rompe el flujo de datos — el banner visual ya avisa.
  }
}
