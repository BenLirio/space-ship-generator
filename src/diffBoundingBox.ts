import Jimp from "jimp";

export interface DiffBoundingBoxRequestBody {
  imageUrlA: string;
  imageUrlB: string;
  // Optional threshold (0-1) for per-pixel difference tolerance
  threshold?: number; // default 0 (exact match) - using simple RGBA distance
  // Minimum size (pixels) for a box to be included
  minBoxArea?: number; // default 4
  // Minimum number of differing pixels (connected component size) to keep a box (noise suppression)
  minClusterPixels?: number; // default 8
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  // Average diff value (0-1) of pixels inside box
  diffScore: number;
  // Number of differing pixels aggregated
  pixels: number;
}

export interface DiffBoundingBoxResponse {
  boxes: BoundingBox[];
  imageWidth: number;
  imageHeight: number;
}

// Compute simple Euclidean color distance normalized to 1 (max 441.672 ~ sqrt(255^2*3))
const colorDistance = (
  r1: number,
  g1: number,
  b1: number,
  a1: number,
  r2: number,
  g2: number,
  b2: number,
  a2: number
) => {
  // treat alpha difference weaker (weight 0.5)
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const da = (a1 - a2) * 0.5;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db + da * da);
  return dist / 441.67295593; // normalize
};

// Merge overlapping or touching boxes (axis aligned)
const mergeBoxes = (boxes: BoundingBox[]): BoundingBox[] => {
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (
          a.x <= b.x + b.width &&
          a.x + a.width >= b.x &&
          a.y <= b.y + b.height &&
          a.y + a.height >= b.y
        ) {
          // merge
          const nx = Math.min(a.x, b.x);
          const ny = Math.min(a.y, b.y);
          const nRight = Math.max(a.x + a.width, b.x + b.width);
          const nBottom = Math.max(a.y + a.height, b.y + b.height);
          const merged: BoundingBox = {
            x: nx,
            y: ny,
            width: nRight - nx,
            height: nBottom - ny,
            diffScore:
              (a.diffScore * a.pixels + b.diffScore * b.pixels) /
              (a.pixels + b.pixels),
            pixels: a.pixels + b.pixels,
          };
          boxes.splice(j, 1);
          boxes.splice(i, 1, merged);
          changed = true;
          break outer;
        }
      }
    }
  }
  return boxes;
};

export async function computeDiffBoundingBoxes(
  req: DiffBoundingBoxRequestBody
): Promise<DiffBoundingBoxResponse> {
  if (!req.imageUrlA || !req.imageUrlB) {
    throw new Error("imageUrlA and imageUrlB are required");
  }
  const threshold =
    typeof req.threshold === "number"
      ? Math.min(Math.max(req.threshold, 0), 1)
      : 0.05; // default 0.05
  const minBoxArea = req.minBoxArea ?? 4;
  const minClusterPixels = req.minClusterPixels ?? 8;

  const [imgA, imgB] = await Promise.all([
    Jimp.read(req.imageUrlA),
    Jimp.read(req.imageUrlB),
  ]);

  if (
    imgA.getWidth() !== imgB.getWidth() ||
    imgA.getHeight() !== imgB.getHeight()
  ) {
    throw new Error("Images must have identical dimensions");
  }

  const w = imgA.getWidth();
  const h = imgA.getHeight();

  // We'll scan diff map and expand flood-fill bounding boxes.
  const visited = new Uint8Array(w * h); // 0 unvisited, 1 visited

  const boxes: BoundingBox[] = [];

  const getIdx = (x: number, y: number) => y * w + x;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const diffValueAt = (x: number, y: number) => {
    const idx = getIdx(x, y) * 4;
    const aPx = Jimp.intToRGBA(imgA.getPixelColor(x, y));
    const bPx = Jimp.intToRGBA(imgB.getPixelColor(x, y));
    return colorDistance(
      aPx.r,
      aPx.g,
      aPx.b,
      aPx.a,
      bPx.r,
      bPx.g,
      bPx.b,
      bPx.a
    );
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = getIdx(x, y);
      if (visited[idx]) continue;
      const diffVal = diffValueAt(x, y);
      const isDiff = diffVal > threshold;
      if (!isDiff) {
        visited[idx] = 1;
        continue;
      }

      // BFS to collect component
      let q: [number, number][] = [[x, y]];
      visited[idx] = 1;
      let minX = x,
        maxX = x,
        minY = y,
        maxY = y;
      let sumDiff = 0;
      let diffPixels = 0;
      while (q.length) {
        const [cx, cy] = q.pop()!;
        const d = diffValueAt(cx, cy);
        sumDiff += d;
        diffPixels++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [dx, dy] of neighbors) {
          const nx = cx + dx,
            ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nIdx = getIdx(nx, ny);
          if (visited[nIdx]) continue;
          const nv = diffValueAt(nx, ny);
          if (nv > threshold) {
            visited[nIdx] = 1;
            q.push([nx, ny]);
          } else {
            visited[nIdx] = 1; // mark visited anyway
          }
        }
      }
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      if (
        diffPixels >= minClusterPixels &&
        boxWidth * boxHeight >= minBoxArea
      ) {
        boxes.push({
          x: minX,
          y: minY,
          width: boxWidth,
          height: boxHeight,
          diffScore: sumDiff / diffPixels,
          pixels: diffPixels,
        });
      }
    }
  }

  const merged = mergeBoxes(boxes);
  // sort boxes by area descending
  merged.sort((a, b) => b.width * b.height - a.width * a.height);

  return { boxes: merged, imageWidth: w, imageHeight: h };
}
