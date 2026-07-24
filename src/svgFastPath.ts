export type SvgFastPathUpload = {
  sourceFile: File;
  sourceDataUrl: string;
  authoredSvgMarkup: string | null;
  readinessEvidence: "ready-line-art" | "needs-simplification" | null;
};

const MIN_INK_PIXELS = 24;
const MAX_INK_COVERAGE = 0.18;
const SVG_PRINT_DPI = 144;
const SVG_CLASSIFICATION_MAX_PX = 960;

export function isSvgFile(file: File) {
  return file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
}

export async function prepareSvgFastPathUpload(file: File): Promise<SvgFastPathUpload> {
  const markup = await file.text();
  validateSvgMarkup(markup);
  const image = await loadSvgImage(markup);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) throw new Error("Unable to prepare the SVG source image.");
  sourceContext.fillStyle = "#ffffff";
  sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);

  const sourceDataUrl = sourceCanvas.toDataURL("image/png");
  const classificationScale = SVG_CLASSIFICATION_MAX_PX / Math.max(image.naturalWidth, image.naturalHeight);
  const classificationCanvas = document.createElement("canvas");
  classificationCanvas.width = Math.max(1, Math.round(image.naturalWidth * classificationScale));
  classificationCanvas.height = Math.max(1, Math.round(image.naturalHeight * classificationScale));
  const classificationContext = classificationCanvas.getContext("2d");
  if (!classificationContext) throw new Error("Unable to classify the SVG linework.");
  classificationContext.fillStyle = "#ffffff";
  classificationContext.fillRect(0, 0, classificationCanvas.width, classificationCanvas.height);
  classificationContext.drawImage(image, 0, 0, classificationCanvas.width, classificationCanvas.height);
  const darkInkStats = measureDarkInk(classificationCanvas);
  const sourceInkDataUrl = darkInkDataUrl(classificationCanvas);
  const useAuthoredInk = sourceInkDataUrl !== null && darkInkLooksLikeLinework(classificationCanvas);
  const sourceBlob = await dataUrlBlob(sourceDataUrl);
  const sourceFile = new File([sourceBlob], `${file.name.replace(/\.svg$/i, "") || "cutout"}.png`, { type: "image/png" });
  return {
    sourceFile,
    sourceDataUrl,
    authoredSvgMarkup: useAuthoredInk ? markup : null,
    readinessEvidence: darkInkStats.inkPixels < MIN_INK_PIXELS
      ? null
      : darkInkStats.coverage > MAX_INK_COVERAGE
        ? "needs-simplification"
      : useAuthoredInk ? "ready-line-art" : "needs-simplification"
  };
}

export async function svgInkForPreview({
  authoredSvgMarkup,
  subjectBoundsPx,
  previewWidthPx,
  previewHeightPx,
  finishedWidthIn,
  finishedHeightIn,
  outerLinePngDataUrl
}: {
  authoredSvgMarkup: string;
  subjectBoundsPx: [number, number, number, number] | undefined;
  previewWidthPx: number;
  previewHeightPx: number;
  finishedWidthIn: number;
  finishedHeightIn: number;
  outerLinePngDataUrl: string;
}): Promise<string | null> {
  if (!subjectBoundsPx || previewWidthPx < 1 || previewHeightPx < 1) return null;
  const source = await loadSvgImage(authoredSvgMarkup);
  const [left, top, right, bottom] = subjectBoundsPx;
  if (right <= left || bottom <= top) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(previewWidthPx, Math.round(finishedWidthIn * SVG_PRINT_DPI));
  canvas.height = Math.max(previewHeightPx, Math.round(finishedHeightIn * SVG_PRINT_DPI));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(
    source,
    left,
    top,
    right - left,
    bottom - top,
    0,
    0,
    canvas.width,
    canvas.height
  );
  await clearInkNearOuterCutline(
    context,
    canvas.width,
    canvas.height,
    outerLinePngDataUrl,
    Math.max(canvas.width / previewWidthPx, canvas.height / previewHeightPx)
  );
  return darkInkDataUrl(canvas);
}

export function validateSvgMarkup(markup: string) {
  if (!/<svg\b/i.test(markup)) throw new Error("The selected file is not a valid SVG image.");
  if (/<!\s*(?:doctype|entity)\b|<\?xml-stylesheet\b/i.test(markup)) {
    throw new Error("This SVG includes document declarations and cannot be imported locally.");
  }
  if (/<\s*(script|foreignObject|iframe|object|embed|image|audio|video|animate|animateMotion|animateTransform|set)\b/i.test(markup)) {
    throw new Error("This SVG includes embedded content and cannot be imported locally.");
  }
  if (/\s+on[a-z][\w:.-]*\s*=/i.test(markup)) {
    throw new Error("This SVG includes interactive behavior and cannot be imported locally.");
  }
  if (/\b(?:javascript|vbscript)\s*:|@import\b|expression\s*\(|-moz-binding\s*:|behavior\s*:/i.test(markup)) {
    throw new Error("This SVG includes interactive behavior and cannot be imported locally.");
  }
  if (hasNonLocalResourceReference(markup) || hasNonLocalCssUrl(markup)) {
    throw new Error("This SVG references external content and cannot be imported locally.");
  }
}

function hasNonLocalResourceReference(markup: string) {
  const resourceAttribute = /\b(?:href|xlink:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  let matchedAttributes = 0;
  while ((match = resourceAttribute.exec(markup)) !== null) {
    matchedAttributes += 1;
    const value = (match[1] ?? match[2] ?? "").trim();
    if (!/^#[A-Za-z_][\w:.-]*$/.test(value)) return true;
  }
  const declaredAttributes = markup.match(/\b(?:href|xlink:href|src)\s*=/gi)?.length ?? 0;
  return matchedAttributes !== declaredAttributes;
}

function hasNonLocalCssUrl(markup: string) {
  const cssUrl = /url\s*\(\s*([^)]+?)\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = cssUrl.exec(markup)) !== null) {
    const value = match[1].trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2").trim();
    if (!/^#[A-Za-z_][\w:.-]*$/.test(value)) return true;
  }
  return false;
}

async function loadSvgImage(markup: string) {
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to rasterize the SVG image."));
    image.src = src;
  });
}

async function dataUrlBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function darkInkDataUrl(canvas: HTMLCanvasElement): string | null {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  let inkPixels = 0;
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (isDarkNeutralInk(imageData.data, index)) {
      imageData.data[index] = 0;
      imageData.data[index + 1] = 0;
      imageData.data[index + 2] = 0;
      imageData.data[index + 3] = 255;
      inkPixels += 1;
    } else {
      imageData.data[index] = 0;
      imageData.data[index + 1] = 0;
      imageData.data[index + 2] = 0;
      imageData.data[index + 3] = 0;
    }
  }
  if (inkPixels < MIN_INK_PIXELS || inkPixels / (canvas.width * canvas.height) > MAX_INK_COVERAGE) return null;
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function isDarkNeutralInk(data: Uint8ClampedArray, index: number) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  return data[index + 3] > 200
    && Math.max(red, green, blue) <= 110
    && Math.max(red, green, blue) - Math.min(red, green, blue) <= 35;
}

function measureDarkInk(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return { inkPixels: 0, coverage: 0 };
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let inkPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (isDarkNeutralInk(pixels, index)) inkPixels += 1;
  }
  return { inkPixels, coverage: inkPixels / (canvas.width * canvas.height) };
}

function darkInkLooksLikeLinework(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const radius = Math.max(2, Math.round(Math.max(canvas.width, canvas.height) / 240));
  let inkPixels = 0;
  let deepInkPixels = 0;
  const isInkAt = (x: number, y: number) => isDarkNeutralInk(pixels, (y * canvas.width + x) * 4);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!isInkAt(x, y)) continue;
      inkPixels += 1;
      if (
        x >= radius
        && y >= radius
        && x + radius < canvas.width
        && y + radius < canvas.height
        && isInkAt(x - radius, y)
        && isInkAt(x + radius, y)
        && isInkAt(x, y - radius)
        && isInkAt(x, y + radius)
      ) deepInkPixels += 1;
    }
  }
  return inkPixels >= MIN_INK_PIXELS && deepInkPixels / inkPixels < 0.55;
}

async function clearInkNearOuterCutline(
  detailContext: CanvasRenderingContext2D,
  width: number,
  height: number,
  outerLinePngDataUrl: string,
  renderScale: number
) {
  const outerLine = await loadImage(outerLinePngDataUrl);
  const maskWidth = Math.max(1, Math.round(width / renderScale));
  const maskHeight = Math.max(1, Math.round(height / renderScale));
  const outerCanvas = document.createElement("canvas");
  outerCanvas.width = maskWidth;
  outerCanvas.height = maskHeight;
  const outerContext = outerCanvas.getContext("2d");
  if (!outerContext) return;
  outerContext.drawImage(outerLine, 0, 0, maskWidth, maskHeight);
  const outer = outerContext.getImageData(0, 0, maskWidth, maskHeight);
  const radius = 12;
  const horizontalCutlineBand = new Uint8Array(maskWidth * maskHeight);
  for (let y = 0; y < maskHeight; y += 1) {
    let cutlinePixels = 0;
    for (let x = 0; x < Math.min(radius, maskWidth); x += 1) {
      if (isOuterCutlinePixel(outer.data, (y * maskWidth + x) * 4)) cutlinePixels += 1;
    }
    for (let x = 0; x < maskWidth; x += 1) {
      const entersWindow = x + radius;
      const leavesWindow = x - radius - 1;
      if (entersWindow < maskWidth && isOuterCutlinePixel(outer.data, (y * maskWidth + entersWindow) * 4)) cutlinePixels += 1;
      if (leavesWindow >= 0 && isOuterCutlinePixel(outer.data, (y * maskWidth + leavesWindow) * 4)) cutlinePixels -= 1;
      if (cutlinePixels > 0) horizontalCutlineBand[y * maskWidth + x] = 1;
    }
  }
  const removalMask = outerContext.createImageData(maskWidth, maskHeight);
  for (let x = 0; x < maskWidth; x += 1) {
    let cutlineRows = 0;
    for (let y = 0; y < Math.min(radius, maskHeight); y += 1) {
      if (horizontalCutlineBand[y * maskWidth + x]) cutlineRows += 1;
    }
    for (let y = 0; y < maskHeight; y += 1) {
      const entersWindow = y + radius;
      const leavesWindow = y - radius - 1;
      if (entersWindow < maskHeight && horizontalCutlineBand[entersWindow * maskWidth + x]) cutlineRows += 1;
      if (leavesWindow >= 0 && horizontalCutlineBand[leavesWindow * maskWidth + x]) cutlineRows -= 1;
      if (cutlineRows > 0) removalMask.data[(y * maskWidth + x) * 4 + 3] = 255;
    }
  }
  outerContext.putImageData(removalMask, 0, 0);
  detailContext.save();
  detailContext.globalCompositeOperation = "destination-out";
  detailContext.imageSmoothingEnabled = false;
  detailContext.drawImage(outerCanvas, 0, 0, width, height);
  detailContext.restore();
}

function isOuterCutlinePixel(data: Uint8ClampedArray, index: number) {
  return data[index + 3] >= 40 && data[index] <= 140 && data[index + 1] <= 140 && data[index + 2] <= 140;
}
