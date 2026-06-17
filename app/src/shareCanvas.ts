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
  bg: "#0B0B0D",
  orange: "#FF4D00", // deep brand orange, single accent
  text: "#F2F2EE",
  muted: "#8E8E86",
  faint: "#5E5E58",
  hair: "rgba(255,255,255,0.09)",
  hairSoft: "rgba(255,255,255,0.06)",
  grid: "rgba(255,255,255,0.022)",
  green: "#3FCB73",
};

// Landscape card: universal Open Graph / X summary_large_image ratio.
const W = 1200;
const H = 630;
const PAD = 64;

// Flat lattice mark (no gradient): a 3x3 grid, echoing lattice cryptography.
function latticeMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
) {
  ctx.save();
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, s * 0.2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.lineJoin = "round";
  const p = x + s * 0.28;
  const top = y + s * 0.28;
  const g = s * 0.44;
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

function hairline(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  color = C.hair,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y + 0.5);
  ctx.lineTo(x1, y + 0.5);
  ctx.stroke();
}

function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: string,
) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  const prev = c.letterSpacing ?? "0px";
  c.letterSpacing = spacing;
  ctx.fillText(text, x, y);
  c.letterSpacing = prev;
}

const truncKey = (k: string) =>
  k.length > 48 ? `${k.slice(0, 28)}...${k.slice(-16)}` : k;

/** Draw the shareable result card (1200x630 landscape). */
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
  ctx.textBaseline = "alphabetic";

  // ---- ground + lattice grid (brand-meaningful texture, very faint) ----
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  const step = 46;
  ctx.beginPath();
  for (let gx = step; gx < W; gx += step) {
    ctx.moveTo(gx + 0.5, 0);
    ctx.lineTo(gx + 0.5, H);
  }
  for (let gy = step; gy < H; gy += step) {
    ctx.moveTo(0, gy + 0.5);
    ctx.lineTo(W, gy + 0.5);
  }
  ctx.stroke();

  // ---- header ----
  latticeMark(ctx, PAD, 50, 38);
  ctx.fillStyle = C.text;
  ctx.font = "800 22px Satoshi, sans-serif";
  tracked(ctx, "LATTICE", PAD + 56, 77, "4px");

  if (data.proof?.verified) {
    ctx.fillStyle = C.green;
    ctx.font = "700 16px Satoshi, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("✓ Proven on-chain", W - PAD, 75);
    ctx.textAlign = "left";
  }
  hairline(ctx, PAD, W - PAD, 104);

  // ---- columns ----
  const leftMax = 612;
  const ruleX = 792; // vertical rule between text + data
  const statX0 = 828;
  const statX1 = W - PAD;

  // ---- eyebrow ----
  ctx.fillStyle = C.orange;
  ctx.font = "700 14px Satoshi, sans-serif";
  tracked(ctx, data.eyebrow.toUpperCase(), PAD, 168, "2.5px");

  // ---- verdict (one or two lines, auto-fit) ----
  ctx.fillStyle = data.accent;
  const words = data.verdict.split(" ");
  const lines =
    words.length > 1 ? [words[0]!, words.slice(1).join(" ")] : [data.verdict];
  let vy = 248;
  for (const ln of lines) {
    let size = 82;
    ctx.font = `900 ${size}px Satoshi, sans-serif`;
    while (ctx.measureText(ln).width > leftMax && size > 44) {
      size -= 4;
      ctx.font = `900 ${size}px Satoshi, sans-serif`;
    }
    ctx.fillText(ln, PAD, vy);
    vy += size + 4;
  }

  // ---- address + exposed-on ----
  ctx.fillStyle = C.muted;
  ctx.font = "500 21px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(data.address, PAD, vy + 8);
  vy += 8;
  if (data.exposedOn) {
    ctx.fillStyle = C.faint;
    ctx.font = "600 17px Satoshi, sans-serif";
    ctx.fillText(`Exposed on ${data.exposedOn}`, PAD, vy + 34);
  }

  // ---- data column: hairline-separated rows, one vertical rule ----
  const stats = data.stats.slice(0, 4);
  const rowH = 72;
  const total = stats.length * rowH;
  const startY = 160 + Math.max(0, (300 - total) / 2);
  ctx.strokeStyle = C.hair;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ruleX + 0.5, startY + 6);
  ctx.lineTo(ruleX + 0.5, startY + total - 6);
  ctx.stroke();

  stats.forEach((st, i) => {
    const rowTop = startY + i * rowH;
    if (i > 0) hairline(ctx, statX0, statX1, rowTop, C.hairSoft);
    const cy = rowTop + rowH / 2;
    ctx.fillStyle = C.faint;
    ctx.font = "700 12px Satoshi, sans-serif";
    ctx.textBaseline = "middle";
    tracked(ctx, st.label.toUpperCase(), statX0, cy, "1.5px");
    ctx.fillStyle = st.color ?? C.text;
    ctx.font = "800 30px Satoshi, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(st.value, statX1, cy + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });

  // ---- footer: proof (left, understated) + CTA (right) ----
  const fy = 548;
  hairline(ctx, PAD, W - PAD, fy - 26);
  if (data.proof) {
    ctx.fillStyle = C.green;
    ctx.font = "700 14px Satoshi, sans-serif";
    ctx.fillText(`✓ Proof verified · ${data.proof.line}`, PAD, fy + 2);
    ctx.fillStyle = C.muted;
    ctx.font = "500 15px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(truncKey(data.proof.key), PAD, fy + 28);
  } else {
    ctx.fillStyle = C.muted;
    ctx.font = "600 16px Satoshi, sans-serif";
    ctx.fillText("Scan any wallet for quantum exposure", PAD, fy + 14);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = C.muted;
  ctx.font = "600 16px Satoshi, sans-serif";
  ctx.fillText(data.cta, W - PAD, fy + 2);
  ctx.fillStyle = C.orange;
  ctx.font = "800 24px Satoshi, sans-serif";
  ctx.fillText(data.site, W - PAD, fy + 28);
  ctx.textAlign = "left";
}
