const sharp = require("sharp");

// Recognises the same picture in a different file: resized, re-saved as JPG or WebP, with more
// margin, or in other colours. The print is the picture's outlines, cropped to its content and
// scaled to a fixed grid, so a graphic can be any dimensions. Averaging hashes (pHash, dHash)
// can't do this for logos: they scored ACME and ACNE as identical.
//
// OUTLINE_TOLERANCE and MATCH_LIMIT were chosen on 50 test logos including near-twins (HB and
// HD): 96-98% of ordinary copies matched, and only logos a letter apart were confused.

const WORK_SIZE = 512;
const GRID = 128;

// How far a grey value can be from the background and still count as background.
const BACKGROUND_TOLERANCE = 24;
// How sharp a change in grey has to be to count as an outline.
const EDGE_STRENGTH = 64;

// Outlines this many pixels apart count as the same outline, which absorbs compression noise.
const OUTLINE_TOLERANCE = 2;
// The share of outline that can differ between two prints of the same picture.
const MATCH_LIMIT = 0.02;

// Greyscale with transparency filled in. The fill contrasts with the picture, so a white logo
// on a transparent background doesn't vanish.
const toGrey = (data, pixels) => {
  const lightness = new Float32Array(pixels);
  let lightnessSum = 0;
  let opacitySum = 0;

  for (let i = 0; i < pixels; i++) {
    const opacity = data[i * 4 + 3] / 255;
    lightness[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    lightnessSum += lightness[i] * opacity;
    opacitySum += opacity;
  }

  if (!opacitySum) return null;

  const fill = lightnessSum / opacitySum < 128 ? 255 : 0;
  const grey = Buffer.alloc(pixels);

  for (let i = 0; i < pixels; i++) {
    const opacity = data[i * 4 + 3] / 255;
    grey[i] = lightness[i] * opacity + fill * (1 - opacity);
  }

  return grey;
};

// The area with the picture in it. A picture with no plain background (a photo) is used whole.
const contentBox = (grey, width, height) => {
  const corners = [grey[0], grey[width - 1], grey[(height - 1) * width], grey[width * height - 1]];

  if (Math.max(...corners) - Math.min(...corners) >= BACKGROUND_TOLERANCE) {
    return { left: 0, top: 0, width, height };
  }

  const background = corners.reduce((sum, value) => sum + value, 0) / corners.length;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (Math.abs(grey[y * width + x] - background) > BACKGROUND_TOLERANCE) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < 0) return null;

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
};

const unpack = (print) => {
  const outline = new Uint8Array(GRID * GRID);

  for (let i = 0; i < outline.length; i++) {
    outline[i] = (print[i >> 3] >> (i & 7)) & 1;
  }

  return outline;
};

const pack = (outline) => {
  const print = Buffer.alloc((GRID * GRID) / 8);

  for (let i = 0; i < outline.length; i++) {
    if (outline[i]) print[i >> 3] |= 1 << (i & 7);
  }

  return print;
};

const widen = (outline) => {
  const wide = new Uint8Array(outline.length);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!outline[y * GRID + x]) continue;

      const maxY = Math.min(GRID - 1, y + OUTLINE_TOLERANCE);
      const maxX = Math.min(GRID - 1, x + OUTLINE_TOLERANCE);

      for (let wy = Math.max(0, y - OUTLINE_TOLERANCE); wy <= maxY; wy++) {
        for (let wx = Math.max(0, x - OUTLINE_TOLERANCE); wx <= maxX; wx++) {
          wide[wy * GRID + wx] = 1;
        }
      }
    }
  }

  return wide;
};

// The print of a file, or null when it can't be read as a picture (AI, EPS, PSD and so on).
// Those are still recognised by their exact contents.
const createVisualPrint = async (filePath) => {
  try {
    const { data, info } = await sharp(filePath, { density: 150 })
      .timeout({ seconds: 20 })
      .ensureAlpha()
      .resize(WORK_SIZE, WORK_SIZE, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const grey = toGrey(data, info.width * info.height);
    const box = grey && contentBox(grey, info.width, info.height);

    if (!box) return null;

    const scaled = await sharp(grey, {
      raw: { width: info.width, height: info.height, channels: 1 },
    })
      .extract(box)
      .resize(GRID, GRID, { fit: "fill" })
      .normalise()
      .greyscale()
      .raw()
      .toBuffer();

    const outline = new Uint8Array(GRID * GRID);

    for (let y = 1; y < GRID - 1; y++) {
      for (let x = 1; x < GRID - 1; x++) {
        const i = y * GRID + x;
        const change =
          Math.abs(scaled[i + 1] - scaled[i - 1]) + Math.abs(scaled[i + GRID] - scaled[i - GRID]);

        if (change > EDGE_STRENGTH) outline[i] = 1;
      }
    }

    return outline.includes(1) ? pack(outline) : null;
  } catch (error) {
    return null;
  }
};

const printsMatch = (firstPrint, secondPrint) => {
  const first = unpack(firstPrint);
  const second = unpack(secondPrint);
  const firstWide = widen(first);
  const secondWide = widen(second);

  let outlinePixels = 0;
  let unmatched = 0;

  for (let i = 0; i < first.length; i++) {
    if (first[i]) {
      outlinePixels++;
      if (!secondWide[i]) unmatched++;
    }

    if (second[i]) {
      outlinePixels++;
      if (!firstWide[i]) unmatched++;
    }
  }

  return outlinePixels > 0 && unmatched / outlinePixels <= MATCH_LIMIT;
};

module.exports = { createVisualPrint, printsMatch };
