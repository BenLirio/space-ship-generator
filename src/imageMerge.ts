import Jimp from "jimp";

/**
 * Merge two PNG images (base64 strings without data URI) by taking:
 *  - the TOP half (y: 0 -> h/2) from first image (topSource)
 *  - the BOTTOM half (y: h/2 -> h) from second image (bottomSource)
 * Images must have identical dimensions; throws otherwise.
 * Returns a base64 PNG (no data URI prefix).
 */
export const mergeTopBottomHalves = async (
  topSourceBase64: string,
  bottomSourceBase64: string
): Promise<string> => {
  const [imgTop, imgBottom] = await Promise.all([
    Jimp.read(Buffer.from(topSourceBase64, "base64")),
    Jimp.read(Buffer.from(bottomSourceBase64, "base64")),
  ]);

  if (
    imgTop.getWidth() !== imgBottom.getWidth() ||
    imgTop.getHeight() !== imgBottom.getHeight()
  ) {
    throw new Error("Images must share identical dimensions for merge");
  }

  const w = imgTop.getWidth();
  const h = imgTop.getHeight();
  const half = Math.floor(h / 2);

  const out = new Jimp(w, h, 0x00000000);
  const topHalf = imgTop.clone().crop(0, 0, w, half);
  const bottomHalf = imgBottom.clone().crop(0, half, w, h - half);
  out.composite(topHalf, 0, 0);
  out.composite(bottomHalf, 0, half);

  const buf = await out.getBufferAsync(Jimp.MIME_PNG);
  return buf.toString("base64");
};
