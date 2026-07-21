export type SvgFastPathUpload = {
  sourceFile: File;
  sourceDataUrl: string;
  sourceInkDataUrl: string | null;
};

const MIN_INK_PIXELS = 24;
const MAX_INK_COVERAGE = 0.18;

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
  sourceContext.drawImage(image, 0, 0);

  const sourceDataUrl = sourceCanvas.toDataURL("image/png");
  const sourceBlob = await dataUrlBlob(sourceDataUrl);
  const sourceFile = new File([sourceBlob], `${file.name.replace(/\.svg$/i, "") || "cutout"}.png`, { type: "image/png" });
  return {
    sourceFile,
    sourceDataUrl,
    sourceInkDataUrl: darkInkDataUrl(sourceCanvas)
  };
}

export async function svgInkForPreview({
  sourceInkDataUrl,
  subjectBoundsPx,
  previewWidthPx,
  previewHeightPx,
  outerLinePngDataUrl
}: {
  sourceInkDataUrl: string;
  subjectBoundsPx: [number, number, number, number] | undefined;
  previewWidthPx: number;
  previewHeightPx: number;
  outerLinePngDataUrl: string;
}): Promise<string | null> {
  if (!subjectBoundsPx || previewWidthPx < 1 || previewHeightPx < 1) return null;
  const source = await loadImage(sourceInkDataUrl);
  const [left, top, right, bottom] = subjectBoundsPx;
  if (right <= left || bottom <= top) return null;

  const canvas = document.createElement("canvas");
  canvas.width = previewWidthPx;
  canvas.height = previewHeightPx;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, left, top, right - left, bottom - top, 0, 0, previewWidthPx, previewHeightPx);
  await clearInkNearOuterCutline(context, previewWidthPx, previewHeightPx, outerLinePngDataUrl);
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

async function clearInkNearOuterCutline(
  detailContext: CanvasRenderingContext2D,
  width: number,
  height: number,
  outerLinePngDataUrl: string
) {
  const outerLine = await loadImage(outerLinePngDataUrl);
  const outerCanvas = document.createElement("canvas");
  outerCanvas.width = width;
  outerCanvas.height = height;
  const outerContext = outerCanvas.getContext("2d");
  if (!outerContext) return;
  outerContext.drawImage(outerLine, 0, 0, width, height);
  const detail = detailContext.getImageData(0, 0, width, height);
  const outer = outerContext.getImageData(0, 0, width, height);
  const radius = 3;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (outer.data[index + 3] < 40 || outer.data[index] > 140 || outer.data[index + 1] > 140 || outer.data[index + 2] > 140) continue;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const px = x + offsetX;
          const py = y + offsetY;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          detail.data[(py * width + px) * 4 + 3] = 0;
        }
      }
    }
  }
  detailContext.putImageData(detail, 0, 0);
}
