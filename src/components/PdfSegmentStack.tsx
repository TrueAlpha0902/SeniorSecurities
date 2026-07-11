import { useEffect, useState, type CSSProperties } from "react";
import type { PdfCropSegment } from "../lib/imageQuiz";
import { pdfImageUrl } from "../lib/pdfAssets";

type PdfSegmentStackProps = {
  label: string;
  segments: PdfCropSegment[];
  priority?: "high" | "auto" | "low";
};

export function PdfSegmentStack({ label, segments, priority = "auto" }: PdfSegmentStackProps) {
  return (
    <div className="pdf-segment-stack" aria-label={label}>
      {segments.map((segment, index) => (
        <PdfCrop
          key={`${segment.src}-${segment.x}-${segment.y}-${segment.width}-${segment.height}`}
          segment={segment}
          priority={index === 0 ? priority : priority === "high" ? "auto" : priority}
        />
      ))}
    </div>
  );
}


function PdfCrop({ segment, priority }: { segment: PdfCropSegment; priority: "high" | "auto" | "low" }) {
  const [retryToken, setRetryToken] = useState(0);
  const [failed, setFailed] = useState(false);
  const imageStyle: CSSProperties = {
    width: `${(segment.pageWidth / segment.width) * 100}%`,
    height: `${(segment.pageHeight / segment.height) * 100}%`,
    left: `${(-segment.x / segment.width) * 100}%`,
    top: `${(-segment.y / segment.height) * 100}%`,
  };

  useEffect(() => {
    setRetryToken(0);
    setFailed(false);
  }, [segment.src, segment.x, segment.y, segment.width, segment.height]);

  return (
    <div className="pdf-crop-viewport" style={{ aspectRatio: `${segment.width} / ${segment.height}` }}>
      <img
        key={`${segment.src}:${retryToken}`}
        src={pdfImageUrl(segment.src, retryToken)}
        alt=""
        loading={priority === "high" ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority}
        style={imageStyle}
        onLoad={() => setFailed(false)}
        onError={() => {
          if (retryToken === 0) {
            setRetryToken(1);
            return;
          }
          setFailed(true);
        }}
      />
      {failed ? <div className="pdf-crop-fallback">題目圖片載入中斷，請重新整理或重新部署新版。</div> : null}
    </div>
  );
}

