import { useId } from "react";

function RoughFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="-12%" y="-12%" width="124%" height="124%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.025 0.09"
        numOctaves="1"
        seed="23"
        result="noise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="0.46"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  );
}

export function SketchSecuritiesHero() {
  const filterId = useId().replace(/:/g, "");
  return (
    <svg
      className="v90-hero-illustration is-securities"
      viewBox="0 0 370 190"
      role="img"
      aria-label="手繪證券K線與上升走勢"
    >
      <defs><RoughFilter id={filterId} /></defs>
      <g filter={`url(#${filterId})`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path className="v90-sketch-faint" d="M28 165c91 4 203 3 313-5" />
        <path className="v90-sketch-line" d="M35 151 81 132 116 141 153 112 188 121 226 82 262 92 322 31" />
        <path className="v90-sketch-line is-bold" d="m309 35 17-7-5 18" />
        <g className="v90-candles">
          <path d="M83 114v42M74 126h18v20H74z" />
          <path d="M126 90v52M117 105h18v24h-18z" />
          <path d="M169 72v61M160 90h18v27h-18z" />
          <path d="M214 50v67M205 68h18v31h-18z" />
          <path d="M260 24v75M251 42h18v35h-18z" />
        </g>
        <path className="v90-sketch-faint" d="M49 160c47 6 96 6 143 2 47-4 95-7 135-14" />
      </g>
    </svg>
  );
}

export function SketchForeignExchangeHero() {
  const filterId = useId().replace(/:/g, "");
  return (
    <svg
      className="v90-hero-illustration is-foreign-exchange"
      viewBox="0 0 370 190"
      role="img"
      aria-label="手繪地球、貨幣符號與匯兌箭頭"
    >
      <defs><RoughFilter id={filterId} /></defs>
      <g filter={`url(#${filterId})`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <circle className="v90-sketch-line" cx="184" cy="91" r="58" />
        <ellipse className="v90-sketch-faint" cx="184" cy="91" rx="28" ry="58" />
        <path className="v90-sketch-faint" d="M126 91h116M136 60c31 16 65 16 96 0M136 122c31-16 65-16 96 0" />
        <path className="v90-sketch-line is-bold" d="M99 47c25-28 62-38 97-29 16 4 30 12 42 23" />
        <path className="v90-sketch-line is-bold" d="m229 31 13 12-18 3" />
        <path className="v90-sketch-line is-bold" d="M255 137c-25 28-62 38-97 29-16-4-30-12-42-23" />
        <path className="v90-sketch-line is-bold" d="m125 153-13-12 18-3" />
        <path className="v90-sketch-faint" d="M83 163c70 8 145 7 214-4" />
      </g>
      <g className="v90-currency-symbols" aria-hidden="true">
        <text x="56" y="85">$</text>
        <text x="282" y="73">€</text>
        <text x="300" y="129">¥</text>
        <text x="72" y="139">$</text>
      </g>
    </svg>
  );
}

export function SketchPinnedNoteArt() {
  const filterId = useId().replace(/:/g, "");
  return (
    <svg className="v90-note-art" viewBox="0 0 170 58" aria-hidden="true">
      <defs><RoughFilter id={filterId} /></defs>
      <g filter={`url(#${filterId})`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 50h162" opacity=".22" />
        <path d="m92 48 19-24 12 14 13-20 26 30" />
        <path d="m136 18 10 4-8 6" />
        <path d="M8 41c18-2 30-12 43-23 9 10 17 12 26 7 4 7 8 12 15 16" opacity=".48" />
        <path d="M143 20v-9h14v10" />
      </g>
    </svg>
  );
}

export function SketchExamInfoArt() {
  const filterId = useId().replace(/:/g, "");
  return (
    <svg className="v90-exam-info-art" viewBox="0 0 120 100" aria-hidden="true">
      <defs><RoughFilter id={filterId} /></defs>
      <g filter={`url(#${filterId})`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 18h70v66H20z" />
        <path d="M31 34h45M31 45h39M31 56h35" opacity=".55" />
        <path d="m79 22 20 19-34 36-17 4 5-16 26-43Z" />
        <path d="m78 23 9 8M52 66l14 12" />
        <path d="M19 88c23 4 51 4 78-2" opacity=".28" />
      </g>
    </svg>
  );
}

export function SketchLearningChart({ values }: { values: number[] }) {
  const filterId = useId().replace(/:/g, "");
  const safe = values.length ? values : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(1, ...safe);
  const width = 330;
  const height = 120;
  const points = safe.map((value, index) => {
    const x = 24 + (index * (width - 48)) / Math.max(1, safe.length - 1);
    const y = 96 - (Math.max(0, value) / max) * 68;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <svg className="v90-learning-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近七日作答趨勢">
      <defs><RoughFilter id={filterId} /></defs>
      <g filter={`url(#${filterId})`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path className="v90-chart-grid" d="M24 28H306M24 62H306M24 96H306" />
        <polyline className="v90-chart-line" points={line} />
        {points.map(([x, y], index) => <circle key={index} className="v90-chart-dot" cx={x} cy={y} r="4" />)}
      </g>
      <g className="v90-chart-labels" aria-hidden="true">
        {Array.from({ length: safe.length }, (_, index) => (
          <text key={index} x={24 + (index * (width - 48)) / Math.max(1, safe.length - 1)} y="116" textAnchor="middle">
            {"日一二三四五六"[index] ?? ""}
          </text>
        ))}
      </g>
    </svg>
  );
}
