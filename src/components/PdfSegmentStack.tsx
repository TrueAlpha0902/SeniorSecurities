import { useEffect, useState, type CSSProperties } from "react";
import { assetUrl, type PdfCropSegment } from "../lib/imageQuiz";

type PdfSegmentStackProps = {
  label: string;
  segments: PdfCropSegment[];
};

export function PdfSegmentStack({ label, segments }: PdfSegmentStackProps) {
  return (
    <div className="pdf-segment-stack" aria-label={label}>
      {segments.map((segment) => (
        <PdfCrop key={`${segment.src}-${segment.x}-${segment.y}-${segment.width}-${segment.height}`} segment={segment} />
      ))}
    </div>
  );
}

const PDF_IMAGE_CACHE_VERSION = "20260706-question-crop-v29";

function PdfCrop({ segment }: { segment: PdfCropSegment }) {
  const [retryToken, setRetryToken] = useState(0);
  const [failed, setFailed] = useState(false);
  // Do not extend the crop downward. Extending the viewport can accidentally show
  // the explanation line when the original PDF crop already ends near the answer.
  const displayHeight = segment.height;
  const imageStyle: CSSProperties = {
    width: `${(segment.pageWidth / segment.width) * 100}%`,
    height: `${(segment.pageHeight / displayHeight) * 100}%`,
    left: `${(-segment.x / segment.width) * 100}%`,
    top: `${(-segment.y / displayHeight) * 100}%`,
  };

  useEffect(() => {
    setRetryToken(0);
    setFailed(false);
  }, [segment.src, segment.x, segment.y, segment.width, segment.height]);

  return (
    <div className="pdf-crop-viewport" style={{ aspectRatio: `${segment.width} / ${displayHeight}` }}>
      <img
        key={`${segment.src}:${retryToken}`}
        src={pdfImageUrl(segment.src, retryToken)}
        alt=""
        loading="eager"
        decoding="async"
        fetchPriority="high"
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

function pdfImageUrl(path: string, retryToken: number): string {
  const url = assetUrl(path);
  const separator = url.includes("?") ? "&" : "?";
  const retry = retryToken > 0 ? `&retry=${retryToken}` : "";
  return `${url}${separator}v=${PDF_IMAGE_CACHE_VERSION}${retry}`;
}
