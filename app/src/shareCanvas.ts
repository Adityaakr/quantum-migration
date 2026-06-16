export type CardStat = { label: string; value: string; color?: string };

export type CardData = {
  address: string;
  eyebrow: string;
  verdict: string;
  accent: string; // hex for eyebrow + verdict
  exposedOn?: string; // "Sepolia, Hoodi"
  stats: CardStat[]; // up to 5
  proof?: { verified: boolean; line: string; key: string };
  cta: string;
  site: string;
};

const C = {
  bg: "#0C0C0E",
  orange: "#FF5500",
  text: "#F4F4F1",
  muted: "#9A9A92",
  faint: "#6E6E68",
  line: "#262629",
  panel: "#161618",
  green: "#36C46A",
};

function latticeMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
) {
  ctx.save();
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, s * 0.22);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.lineJoin = "round";
  const p = x + s * 0.27;
  const top = y + s * 0.27;
  const g = s * 0.46;
  ctx.strokeRect(p, top, g, g);
  for (let i = 1; i < 3; i++) {
    const off = (g / 3) * i;
    ctx.beginPath();
    ctx.moveTo(p + off, top);
    ctx.lineTo(p + off, top + g);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p, top + off);
    ctx.lineTo(p + g, top + off);
    ctx.stroke();
  }
  ctx.restore();
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  y: number,
  color: string,
) {
  ctx.font = "800 16px Satoshi, sans-serif";
  const w = ctx.measureText(text).width + 32;
  const h = 36;
  const x = rightX - w;
  ctx.fillStyle = color + "22";
  ctx.strokeStyle = color + "55";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 16, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

const truncKey = (k: string) =>
  k.length > 44 ? `${k.slice(0, 24)}...${k.slice(-16)}` : k;

/** Draw the shareable result card (1200x630, standard social/OG size). */
export async function drawShareCard(
  canvas: HTMLCanvasElement,
  data: CardData,
): Promise<void> {
  try {
    await (document as { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  } catch {
    /* no-op */
  }

  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W - 120, 40, 0, W - 120, 40, 620);
  glow.addColorStop(0, "rgba(255,85,0,0.13)");
  glow.addColorStop(1, "rgba(255,85,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = C.orange;
  ctx.fillRect(0, 0, 10, H);

  const PAD = 72;
  ctx.textBaseline = "alphabetic";

  // brand
  latticeMark(ctx, PAD, 50, 50);
  ctx.fillStyle = C.text;
  ctx.font = "900 32px Satoshi, sans-serif";
  ctx.fillText("Lattice", PAD + 66, 77);
  ctx.fillStyle = C.muted;
  ctx.font = "500 16px Satoshi, sans-serif";
  ctx.fillText("Post-Quantum Wallet Safety", PAD + 66, 99);

  // proven badge (top-right)
  if (data.proof?.verified) {
    pill(ctx, "✓ CRYPTOGRAPHICALLY PROVEN", W - PAD, 50, C.green);
  }

  // eyebrow
  ctx.fillStyle = data.accent;
  ctx.font = "700 17px Satoshi, sans-serif";
  ctx.fillText(data.eyebrow.toUpperCase(), PAD, 172);

  // verdict
  ctx.fillStyle = data.accent;
  ctx.font = "900 70px Satoshi, sans-serif";
  ctx.fillText(data.verdict, PAD, 240);

  // address
  ctx.fillStyle = C.muted;
  ctx.font = "500 20px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(data.address, PAD, 280);

  // exposed-on line
  if (data.exposedOn) {
    ctx.fillStyle = C.faint;
    ctx.font = "600 16px Satoshi, sans-serif";
    ctx.fillText(`Exposed on ${data.exposedOn}`, PAD, 308);
  }

  // stat cards
  const stats = data.stats.slice(0, 5);
  if (stats.length) {
    const gap = 14;
    const totalW = W - PAD * 2;
    const cw = (totalW - gap * (stats.length - 1)) / stats.length;
    const sy = 338;
    const sh = 112;
    stats.forEach((st, i) => {
      const sx = PAD + i * (cw + gap);
      ctx.fillStyle = C.panel;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(sx, sy, cw, sh, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.faint;
      ctx.font = "700 11px Satoshi, sans-serif";
      ctx.fillText(st.label.toUpperCase(), sx + 18, sy + 34);
      ctx.fillStyle = st.color ?? C.text;
      ctx.font = "800 27px Satoshi, sans-serif";
      ctx.fillText(st.value, sx + 18, sy + 78);
    });
  }

  // proof + recovered key strip
  if (data.proof) {
    const y = 476;
    const h = 66;
    ctx.fillStyle = "rgba(54,196,106,0.06)";
    ctx.strokeStyle = "rgba(54,196,106,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(PAD, y, W - PAD * 2, h, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.green;
    ctx.font = "800 14px Satoshi, sans-serif";
    ctx.fillText(`PROOF  ${data.proof.line}`, PAD + 18, y + 26);
    ctx.fillStyle = C.muted;
    ctx.font = "500 15px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(truncKey(data.proof.key), PAD + 18, y + 50);
  }

  // footer CTA
  ctx.font = "700 19px Satoshi, sans-serif";
  ctx.fillStyle = C.text;
  const ctaY = H - 38;
  ctx.fillText(data.cta, PAD, ctaY);
  const ctaW = ctx.measureText(`${data.cta} `).width;
  ctx.fillStyle = C.orange;
  ctx.fillText(data.site, PAD + ctaW, ctaY);
}
