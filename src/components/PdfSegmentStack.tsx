import { memo, useEffect, useState, type CSSProperties } from "react";
import type { PdfCropSegment } from "../lib/imageQuiz";
import { pdfImageUrl } from "../lib/pdfAssets";

type PdfSegmentStackProps = {
  label: string;
  segments: PdfCropSegment[];
  priority?: "high" | "auto" | "low";
  activeIndex?: number;
};

export const PdfSegmentStack = memo(function PdfSegmentStack({ label, segments, priority = "auto", activeIndex }: PdfSegmentStackProps) {
  return (
    <div className="pdf-segment-stack" aria-label={label}>
      {segments.map((segment, index) => (
        <PdfCrop
          key={`${segment.src}-${segment.page}-${index}`}
          segment={segment}
          priority={index === 0 ? priority : priority === "high" ? "auto" : priority}
          isActive={activeIndex === index}
          segmentNumber={index + 1}
        />
      ))}
    </div>
  );
});


const PdfCrop = memo(function PdfCrop({
  segment,
  priority,
  isActive,
  segmentNumber,
}: {
  segment: PdfCropSegment;
  priority: "high" | "auto" | "low";
  isActive: boolean;
  segmentNumber: number;
}) {
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
  }, [segment.src]);

  return (
    <div
      className={`pdf-crop-viewport${isActive ? " is-admin-active-segment" : ""}`}
      data-segment-number={isActive ? segmentNumber : undefined}
      style={{ aspectRatio: `${segment.width} / ${segment.height}` }}
    >
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
});
