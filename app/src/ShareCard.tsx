import { useEffect, useRef, useState } from "react";

import { type CardData, drawShareCard } from "./shareCanvas.js";

export function ShareCard({
  data,
  summary,
}: {
  data: CardData;
  summary: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (ref.current) void drawShareCard(ref.current, data);
  }, [data]);

  const download = () => {
    const c = ref.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "lattice-quantum-scan.png";
    a.click();
  };

  const shareX = () =>
    window.open(
      "https://twitter.com/intent/tweet?text=" + encodeURIComponent(summary),
      "_blank",
      "noopener",
    );

  const copyText = () => {
    void navigator.clipboard?.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  };

  return (
    <div className="sharecard">
      <canvas ref={ref} className="share-canvas" width={1200} height={630} />
      <div className="row">
        <button className="btn primary" onClick={download}>
          Download PNG
        </button>
        <button className="btn outline" onClick={shareX}>
          Share on X
        </button>
        <button className="btn ghost" onClick={copyText}>
          {copied ? "Copied" : "Copy summary"}
        </button>
      </div>
    </div>
  );
}
