import { useEffect, useRef, useState } from "react";

import { type CardData, drawShareCard } from "./shareCanvas.js";

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

export function ShareCard({
  data,
  summary,
}: {
  data: CardData;
  summary: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (ref.current) void drawShareCard(ref.current, data);
  }, [data]);

  const download = async () => {
    const c = ref.current;
    if (!c) return;
    const blob = await toBlob(c);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lattice-quantum-scan.png";
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareX = async () => {
    const c = ref.current;
    if (!c) return;
    const blob = await toBlob(c);
    const file = blob
      ? new File([blob], "lattice-quantum-scan.png", { type: "image/png" })
      : null;

    // Best path: native share sheet WITH the image attached (mobile + Safari).
    const nav = navigator as Navigator & {
      canShare?: (d: { files?: File[] }) => boolean;
    };
    if (file && nav.canShare?.({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({
          files: [file],
          text: summary,
          title: "Lattice quantum scan",
        });
        return;
      } catch {
        // user cancelled or share failed -> fall through to the desktop path
      }
    }

    // Desktop fallback: download the image, open the X composer, tell the user.
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lattice-quantum-scan.png";
      a.click();
      URL.revokeObjectURL(url);
    }
    window.open(
      "https://twitter.com/intent/tweet?text=" + encodeURIComponent(summary),
      "_blank",
      "noopener",
    );
    setNote("Image downloaded. Attach it to your post (X cannot auto-attach).");
    setTimeout(() => setNote(""), 6000);
  };

  const copyText = () => {
    void navigator.clipboard?.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  };

  return (
    <div className="sharecard">
      <canvas ref={ref} className="share-canvas" width={1080} height={1350} />
      <div className="row">
        <button className="btn primary" onClick={shareX}>
          Share on X
        </button>
        <button className="btn outline" onClick={download}>
          Download PNG
        </button>
        <button className="btn ghost" onClick={copyText}>
          {copied ? "Copied" : "Copy summary"}
        </button>
      </div>
      {note && <p className="scanhint">{note}</p>}
    </div>
  );
}
