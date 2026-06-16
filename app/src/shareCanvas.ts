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

// Portrait card: stands out in a vertical social feed.
const W = 1080;
const H = 1350;

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

/** Pill anchored to its right edge. */
function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  y: number,
  color: string,
) {
  ctx.font = "800 18px Satoshi, sans-serif";
  const w = ctx.measureText(text).width + 36;
  const h = 40;
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
  ctx.fillText(text, x + 18, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

const truncKey = (k: string) =>
  k.length > 40 ? `${k.slice(0, 22)}...${k.slice(-14)}` : k;

/** Draw the shareable result card (1080x1350 portrait). */
export async function drawShareCard(
  canvas: HTMLCanvasElement,
  data: CardData,
): Promise<void> {
  try {
    await (document as { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  } catch {
    /* no-op */
  }

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // background + top glow
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 60, -40, 0, W - 60, -40, 760);
  glow.addColorStop(0, "rgba(255,85,0,0.16)");
  glow.addColorStop(1, "rgba(255,85,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // left accent bar
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, 0, 12, H);

  const PAD = 84;
  const maxW = W - PAD * 2;
  ctx.textBaseline = "alphabetic";

  // ---- brand row ----
  latticeMark(ctx, PAD, 74, 64);
  ctx.fillStyle = C.text;
  ctx.font = "900 40px Satoshi, sans-serif";
  ctx.fillText("Lattice", PAD + 84, 108);
  ctx.fillStyle = C.muted;
  ctx.font = "500 18px Satoshi, sans-serif";
  ctx.fillText("Post-Quantum Wallet Safety", PAD + 84, 134);

  if (data.proof?.verified) {
    pill(ctx, "✓ PROVEN", W - PAD, 80, C.green);
  }

  // ---- eyebrow ----
  ctx.fillStyle = data.accent;
  ctx.font = "700 22px Satoshi, sans-serif";
  ctx.fillText(data.eyebrow.toUpperCase(), PAD, 268);

  // ---- verdict (one or two lines, auto-fit) ----
  ctx.fillStyle = data.accent;
  const words = data.verdict.split(" ");
  const lines =
    words.length > 1 ? [words[0]!, words.slice(1).join(" ")] : [data.verdict];
  let vy = 356;
  for (const ln of lines) {
    let size = 94;
    ctx.font = `900 ${size}px Satoshi, sans-serif`;
    while (ctx.measureText(ln).width > maxW && size > 48) {
      size -= 4;
      ctx.font = `900 ${size}px Satoshi, sans-serif`;
    }
    ctx.fillText(ln, PAD, vy);
    vy += size + 6;
  }

  // ---- address ----
  ctx.fillStyle = C.muted;
  ctx.font = "500 23px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(data.address, PAD, vy + 8);
  vy += 8;

  // ---- exposed-on line ----
  if (data.exposedOn) {
    ctx.fillStyle = C.faint;
    ctx.font = "600 19px Satoshi, sans-serif";
    ctx.fillText(`Exposed on ${data.exposedOn}`, PAD, vy + 40);
    vy += 40;
  }

  // ---- stat rows (vertical stack, capped to fit) ----
  const stats = data.stats.slice(0, 4);
  const rowH = 86;
  const gap = 12;
  let sy = vy + 44;
  for (const st of stats) {
    ctx.fillStyle = C.panel;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(PAD, sy, maxW, rowH, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.faint;
    ctx.font = "700 14px Satoshi, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(st.label.toUpperCase(), PAD + 26, sy + rowH / 2);
    ctx.fillStyle = st.color ?? C.text;
    ctx.font = "800 32px Satoshi, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(st.value, W - PAD - 26, sy + rowH / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    sy += rowH + gap;
  }

  // ---- proof + recovered key strip (flows right after the stats) ----
  if (data.proof) {
    const h = 100;
    const y = Math.min(sy + 6, H - 168);
    ctx.fillStyle = "rgba(54,196,106,0.06)";
    ctx.strokeStyle = "rgba(54,196,106,0.30)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(PAD, y, maxW, h, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.green;
    ctx.font = "800 16px Satoshi, sans-serif";
    ctx.fillText(`PROOF · ${data.proof.line}`, PAD + 24, y + 38);
    ctx.fillStyle = C.muted;
    ctx.font = "500 18px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(truncKey(data.proof.key), PAD + 24, y + 72);
  }

  // ---- footer CTA (two lines: prompt, then site in orange) ----
  ctx.fillStyle = C.text;
  ctx.font = "700 23px Satoshi, sans-serif";
  ctx.fillText(data.cta, PAD, H - 96);
  ctx.fillStyle = C.orange;
  ctx.font = "800 28px Satoshi, sans-serif";
  ctx.fillText(data.site, PAD, H - 58);
}
