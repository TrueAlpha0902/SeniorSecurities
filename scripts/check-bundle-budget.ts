import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const distRoot = resolve("dist");
const indexHtml = await readFile(resolve(distRoot, "index.html"), "utf8");
const initialReferences = Array.from(
  indexHtml.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g),
  (match) => match[1]!,
).filter((value, index, values) => values.indexOf(value) === index);

const initialAssets = await Promise.all(
  initialReferences.map(async (reference) => {
    const assetOffset = reference.indexOf("assets/");
    const relative = assetOffset >= 0
      ? reference.slice(assetOffset)
      : reference.replace(/^\.?\//, "");
    const path = resolve(distRoot, relative);
    const bytes = await readFile(path);
    return {
      file: relative,
      rawBytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
    };
  }),
);

const assetNames = await readdir(resolve(distRoot, "assets"));
const allJsCss = await Promise.all(
  assetNames
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map(async (name) => {
      const path = resolve(distRoot, "assets", name);
      const info = await stat(path);
      return { file: `assets/${name}`, rawBytes: info.size };
    }),
);

const initialGzip = initialAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const largestJavaScript = allJsCss
  .filter((asset) => asset.file.endsWith(".js"))
  .sort((left, right) => right.rawBytes - left.rawBytes)[0];
const largestCss = allJsCss
  .filter((asset) => asset.file.endsWith(".css"))
  .sort((left, right) => right.rawBytes - left.rawBytes)[0];

const limits = {
  initialGzip: 235 * 1024,
  largestJavaScript: 360 * 1024,
  // v93 dark/accessibility convergence is 260.2 KiB raw and 44.9 KiB gzip.
  // Keep less than 1 KiB of raw CSS headroom without relaxing load budgets.
  largestCss: 261 * 1024,
};

console.log("Initial assets:");
for (const asset of initialAssets) {
  console.log(
    `- ${asset.file}: ${(asset.rawBytes / 1024).toFixed(1)} KiB raw / ${(asset.gzipBytes / 1024).toFixed(1)} KiB gzip`,
  );
}
console.log(`Initial total: ${(initialGzip / 1024).toFixed(1)} KiB gzip`);
console.log(
  `Largest JS: ${largestJavaScript?.file ?? "none"} (${((largestJavaScript?.rawBytes ?? 0) / 1024).toFixed(1)} KiB)`,
);
console.log(
  `Largest CSS: ${largestCss?.file ?? "none"} (${((largestCss?.rawBytes ?? 0) / 1024).toFixed(1)} KiB)`,
);

const errors: string[] = [];
if (initialGzip > limits.initialGzip) {
  errors.push(
    `Initial gzip budget exceeded: ${(initialGzip / 1024).toFixed(1)} KiB > ${(limits.initialGzip / 1024).toFixed(0)} KiB`,
  );
}
if ((largestJavaScript?.rawBytes ?? 0) > limits.largestJavaScript) {
  errors.push(
    `Largest JS budget exceeded: ${largestJavaScript?.file} is ${((largestJavaScript?.rawBytes ?? 0) / 1024).toFixed(1)} KiB`,
  );
}
if ((largestCss?.rawBytes ?? 0) > limits.largestCss) {
  errors.push(
    `Largest CSS budget exceeded: ${largestCss?.file} is ${((largestCss?.rawBytes ?? 0) / 1024).toFixed(1)} KiB`,
  );
}
if (errors.length > 0) {
  throw new Error(errors.join("\n"));
}
