// The rack-display face, drawn into a 1280×400 canvas used as the 3D screen's texture.
// Parameters and drawing are ported from rack-display (web/events.js BASE/EMO, web/index.html draw())
// and trimmed to what reads at texture size. Replace with rack-display's shared face.js once it exists.

const W = 1280, H = 400, TAU = Math.PI * 2;

type Params = Record<keyof typeof BASE, number>;
const BASE = { w: 190, h: 210, r: 58, sep: 205, lid: 0, tilt: 0, happy: 0, closeL: 0, closeR: 0, x: 0, gx: 0, gy: 0,
  mW: 0, mC: 0, mO: 0, jit: 0, sweat: 0, blush: 0, zzz: 0, dim: 0 };
const EMO: Record<string, Partial<Params> & { col: string }> = {
  idle:       { col: '#4de1ff', mW: 54, mC: .35 },
  tap:        { col: '#ff8fd0', happy: .75, mW: 120, mC: 1, h: 200 },
  sleep:      { col: '#4a7dff', closeL: 1, closeR: 1, zzz: 1, gx: 0, gy: .3, dim: 1 },
  backup:     { col: '#5ef2a0', lid: .26, gx: .4, gy: .4, mW: 36, mC: .1 },
  torrent:    { col: '#b48cff', lid: .12, gx: 0, gy: .6, mW: 30, mC: .3, h: 200 },
  fluxRec:    { col: '#4de1ff', gx: .5, gy: -.6, mW: 34, mC: 0 },
  parity:     { col: '#38d9c4', lid: .28, gx: 0, gy: .35, mW: 36, mC: .1 },
  cpu:        { col: '#ff9a3d', lid: .3, tilt: .2, jit: 1, sweat: 1, mW: 92, mC: -.1 },
  hot:        { col: '#ff7a59', lid: .42, tilt: -.1, blush: 1, mO: .55 },
  backupFail: { col: '#ffb547', lid: .16, tilt: -.34, sweat: 1, mW: 70, mC: -.6 },
  fluxFail:   { col: '#ffb547', lid: .46, tilt: .36, mW: 80, mC: -.15 },
  alarm:      { col: '#ff4d6d', w: 172, h: 250, mO: 1 },
  nodeDown:   { col: '#ff8a4d', closeR: 1, lid: .1, tilt: -.16, mW: 70, mC: -.45 },
  crash:      { col: '#ff4d6d', x: 1, mO: .8 },
  stale:      { col: '#8b98a0', lid: .3, tilt: -.18, gx: 0, gy: .2, mW: 46, mC: -.25 },
};

const hex2rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgb = (c: number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class Face {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layer: HTMLCanvasElement;
  private lx: CanvasRenderingContext2D;
  private P: Params = { ...BASE };
  private col = hex2rgb(EMO.idle.col);
  private T = 0;
  private blinkT = -1; private nextBlink = 2; private nextSacc = 1;
  private sacc = { x: 0, y: 0 }; private breath = 0;
  emote = 'idle';

  constructor(scale = 0.5) {
    this.canvas = document.createElement('canvas');
    this.layer = document.createElement('canvas');
    for (const c of [this.canvas, this.layer]) { c.width = W * scale; c.height = H * scale; }
    this.ctx = this.canvas.getContext('2d')!;
    this.lx = this.layer.getContext('2d')!;
    this.ctx.scale(scale, scale);
    this.lx.scale(scale, scale);
  }

  step(dt: number, cpu = 0.1) {
    this.T += dt;
    const { P, T } = this;
    const def = EMO[this.emote] ?? EMO.idle;
    const tgt: Params = { ...BASE, ...def } as Params;
    if (T > this.nextSacc) {
      this.sacc = Math.random() < .35 ? { x: 0, y: 0 } : { x: rand(-.6, .6), y: rand(-.35, .3) };
      this.nextSacc = T + rand(1.5, 4.5);
    }
    if (def.gx === undefined) { tgt.gx = this.sacc.x; tgt.gy = this.sacc.y; }
    const k = 1 - Math.exp(-dt * 7), kg = 1 - Math.exp(-dt * 14);
    for (const key in BASE) {
      const kk = key as keyof Params;
      P[kk] += (tgt[kk] - P[kk]) * (kk === 'gx' || kk === 'gy' ? kg : k);
    }
    const c = hex2rgb(def.col);
    for (let i = 0; i < 3; i++) this.col[i] += (c[i] - this.col[i]) * k;
    if (T > this.nextBlink && this.blinkT < 0) this.blinkT = T;
    if (this.blinkT >= 0 && T - this.blinkT > .17) { this.blinkT = -1; this.nextBlink = T + (Math.random() < .2 ? .25 : rand(2.2, 6)); }
    this.breath += dt * TAU / (this.emote === 'sleep' ? 5.5 : 4.2 - 2.6 * clamp(cpu, 0, 1));
    this.draw();
  }

  private blink() {
    if (this.blinkT < 0 || this.emote === 'sleep' || this.P.x > .5) return 0;
    return Math.sin(Math.PI * clamp((this.T - this.blinkT) / .17, 0, 1));
  }

  private draw() {
    const { P, T, lx, ctx } = this;
    const bob = Math.sin(this.breath) * 5;
    const jx = P.jit * rand(-3, 3), jy = P.jit * rand(-2, 2);
    const cx = 640, cy = 176 + bob;
    const c = rgb(this.col), b = this.blink();
    let rEye = { x0: 0, y0: 0, w: 0 };

    lx.clearRect(0, 0, W, H);
    lx.fillStyle = c; lx.strokeStyle = c; lx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const close = Math.max(side < 0 ? P.closeL : P.closeR, b);
      const ex = cx + side * P.sep + P.gx * 70 + jx, ey = cy + P.gy * 45 + jy;
      const w = P.w, h = Math.max(14, P.h * (1 - close * .93));
      const x0 = ex - w / 2, y0 = ey - h / 2 + (P.h - h) * .2;
      if (side > 0) rEye = { x0, y0, w };

      lx.globalCompositeOperation = 'source-over';
      lx.globalAlpha = 1 - P.x;
      lx.beginPath(); lx.roundRect(x0, y0, w, h, Math.min(P.r, h / 2)); lx.fill();

      lx.globalCompositeOperation = 'destination-out';
      lx.globalAlpha = 1;
      const lidIn = y0 + (P.lid + P.tilt / 2) * h, lidOut = y0 + (P.lid - P.tilt / 2) * h;
      const yL = side < 0 ? lidOut : lidIn, yR = side < 0 ? lidIn : lidOut, slope = (yR - yL) / w;
      lx.beginPath();
      lx.moveTo(x0 - 30, y0 - 80); lx.lineTo(x0 + w + 30, y0 - 80);
      lx.lineTo(x0 + w + 30, yR + slope * 30); lx.lineTo(x0 - 30, yL - slope * 30);
      lx.fill();
      if (P.happy > .01) {
        const ry = h * .55;
        lx.beginPath(); lx.ellipse(ex, y0 + h - P.happy * h * .6 + ry, w * .8, ry, 0, 0, TAU); lx.fill();
      }
      lx.globalCompositeOperation = 'source-over';

      if (P.x > .01) {
        const s = 60, a = Math.sin(T * 3 + side) * .12;
        lx.save(); lx.globalAlpha = P.x; lx.translate(ex, ey); lx.rotate(a); lx.lineWidth = 30;
        lx.beginPath(); lx.moveTo(-s, -s); lx.lineTo(s, s); lx.moveTo(s, -s); lx.lineTo(-s, s); lx.stroke();
        lx.restore();
      }
    }
    lx.globalAlpha = 1;
    const my = cy + 152;
    if (P.mW > 6) {
      lx.lineWidth = 12; lx.beginPath(); lx.moveTo(cx - P.mW / 2, my);
      lx.quadraticCurveTo(cx, my + P.mC * 36, cx + P.mW / 2, my); lx.stroke();
    }
    if (P.mO > .03) { lx.beginPath(); lx.ellipse(cx, my + 4, 9 + P.mO * 14, 3 + P.mO * 19, 0, 0, TAU); lx.fill(); }

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.shadowColor = rgb(this.col, .75); ctx.shadowBlur = 30;
    ctx.drawImage(this.layer, 0, 0, W, H);
    ctx.shadowBlur = 0;

    if (P.blush > .02) {
      ctx.fillStyle = `rgba(255,80,110,${.42 * P.blush})`;
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * (P.sep + 38), cy + 132, 50, 15, 0, 0, TAU); ctx.fill(); }
    }
    if (P.sweat > .02) {
      const f = (T * .9) % 1, x = rEye.x0 + rEye.w + 34, y = rEye.y0 + 4 + f * 70;
      ctx.fillStyle = `rgba(130,215,255,${P.sweat * (1 - f * .7)})`;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill();
    }
    if (P.zzz > .02) {
      ctx.fillStyle = c; ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const f = (T * .28 + i / 3) % 1;
        ctx.globalAlpha = P.zzz * Math.sin(f * Math.PI);
        ctx.font = `700 ${20 + f * 30}px system-ui, sans-serif`;
        ctx.fillText('z', rEye.x0 + rEye.w + 40 + f * 70, cy - 30 - f * 110);
      }
      ctx.globalAlpha = 1;
    }
    if (P.dim > .01) { ctx.fillStyle = `rgba(0,0,0,${P.dim * .35})`; ctx.fillRect(0, 0, W, H); }
  }
}
