import { useState, type CSSProperties, type ImgHTMLAttributes } from "react";

export type HandwrittenAssetCategory = "labels" | "icons" | "illustrations" | "states";

type HandwrittenAssetProps = {
  category: HandwrittenAssetCategory;
  name: string;
  text: string;
  className?: string;
  decorative?: boolean;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  style?: CSSProperties;
};

export function HandwrittenAsset({
  category,
  name,
  text,
  className = "",
  decorative = false,
  loading = "lazy",
  style,
}: HandwrittenAssetProps) {
  const [failed, setFailed] = useState(false);
  const classes = ["handwritten-asset", `is-${category}`, className].filter(Boolean).join(" ");

  if (failed) {
    if (decorative) return null;
    return (
      <span
        className={`${classes} handwritten-asset-fallback`}
        style={style}
        role="img"
        aria-label={text}
      >
        {text}
      </span>
    );
  }

  const accessibilityProps = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": text };

  return (
    <span className={classes} style={style} {...accessibilityProps}>
      <img
        src={`/handwritten-ui/${category}/${name}.png`}
        alt=""
        aria-hidden="true"
        loading={loading}
        draggable={false}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export function HandwrittenLabel({
  name,
  text,
  className,
}: Pick<HandwrittenAssetProps, "name" | "text" | "className">) {
  return <HandwrittenAsset category="labels" name={name} text={text} className={className} />;
}

export function HandwrittenIcon({
  name,
  text,
  className,
  decorative = true,
}: Pick<HandwrittenAssetProps, "name" | "text" | "className" | "decorative">) {
  return (
    <HandwrittenAsset
      category="icons"
      name={name}
      text={text}
      className={className}
      decorative={decorative}
    />
  );
}
