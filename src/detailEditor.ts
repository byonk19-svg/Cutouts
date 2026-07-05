export type CanvasPoint = {
  x: number;
  y: number;
};

export type RemoveSegmentResult = {
  changed: boolean;
  removedPixels: number;
};

type Pixel = {
  x: number;
  y: number;
};

const DEFAULT_HIT_RADIUS_PX = 10;
const DEFAULT_MAX_COMPONENT_PIXELS = 1800;
const DEFAULT_BOUNDED_RADIUS_PX = 54;

export function removeClickedDetailSegment(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: CanvasPoint,
  options: {
    hitRadiusPx?: number;
    maxComponentPixels?: number;
    boundedRadiusPx?: number;
  } = {}
): RemoveSegmentResult {
  const hitRadiusPx = options.hitRadiusPx ?? DEFAULT_HIT_RADIUS_PX;
  const maxComponentPixels = options.maxComponentPixels ?? DEFAULT_MAX_COMPONENT_PIXELS;
  const boundedRadiusPx = options.boundedRadiusPx ?? DEFAULT_BOUNDED_RADIUS_PX;
  const seed = findNearestDetailPixel(pixels, width, height, point, hitRadiusPx);
  if (!seed) return { changed: false, removedPixels: 0 };

  const component = collectConnectedDetailPixels(pixels, width, height, seed);
  const pixelsToRemove = component.length > maxComponentPixels
    ? component.filter((pixel) => distance(pixel, seed) <= boundedRadiusPx)
    : component;

  for (const pixel of pixelsToRemove) {
    const index = pixelIndex(pixel.x, pixel.y, width);
    pixels[index] = 0;
    pixels[index + 1] = 0;
    pixels[index + 2] = 0;
    pixels[index + 3] = 0;
  }

  return { changed: pixelsToRemove.length > 0, removedPixels: pixelsToRemove.length };
}

function findNearestDetailPixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: CanvasPoint,
  radius: number
): Pixel | null {
  const centerX = clamp(Math.round(point.x), 0, width - 1);
  const centerY = clamp(Math.round(point.y), 0, height - 1);
  let nearest: Pixel | null = null;
  let nearestDistance = Infinity;

  for (let y = Math.max(0, centerY - radius); y <= Math.min(height - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(width - 1, centerX + radius); x += 1) {
      if (!isDetailPixel(pixels, x, y, width)) continue;
      const currentDistance = Math.hypot(x - point.x, y - point.y);
      if (currentDistance <= radius && currentDistance < nearestDistance) {
        nearest = { x, y };
        nearestDistance = currentDistance;
      }
    }
  }

  return nearest;
}

function collectConnectedDetailPixels(pixels: Uint8ClampedArray, width: number, height: number, seed: Pixel): Pixel[] {
  const visited = new Uint8Array(width * height);
  const stack = [seed];
  const component: Pixel[] = [];
  visited[seed.y * width + seed.x] = 1;

  while (stack.length > 0) {
    const pixel = stack.pop();
    if (!pixel) continue;
    component.push(pixel);

    for (let ny = pixel.y - 1; ny <= pixel.y + 1; ny += 1) {
      for (let nx = pixel.x - 1; nx <= pixel.x + 1; nx += 1) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || (nx === pixel.x && ny === pixel.y)) continue;
        const visitedIndex = ny * width + nx;
        if (visited[visitedIndex] || !isDetailPixel(pixels, nx, ny, width)) continue;
        visited[visitedIndex] = 1;
        stack.push({ x: nx, y: ny });
      }
    }
  }

  return component;
}

function isDetailPixel(pixels: Uint8ClampedArray, x: number, y: number, width: number) {
  const index = pixelIndex(x, y, width);
  return pixels[index + 3] > 16 && pixels[index] < 240 && pixels[index + 1] < 240 && pixels[index + 2] < 240;
}

function pixelIndex(x: number, y: number, width: number) {
  return (y * width + x) * 4;
}

function distance(a: Pixel, b: Pixel) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
