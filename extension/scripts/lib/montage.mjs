// ffmpeg helpers for building store-listing demo videos out of the per-scenario
// WebM clips that Playwright's `recordVideo` produces. Shared by the browser
// recorder (record-store-video.mjs) and the Android capture script's post step.
//
// No npm dependencies — just shells out to the system `ffmpeg` (same as
// record-demos.mjs). All the look-and-feel knobs are the named constants below
// so pacing/zoom can be re-tuned in one place.

import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// ---- Tunable constants ------------------------------------------------------

// 16:9 store/YouTube canvas. Bump to "1920:1080" for a sharper master.
export const CANVAS = "1280:720";
const [CANVAS_W, CANVAS_H] = CANVAS.split(":").map(Number);

// Ken Burns zoom: start at 1.0, creep toward ZOOM_MAX by ZOOM_STEP per frame.
export const ZOOM_MAX = 1.18;
export const ZOOM_STEP = 0.0015;
export const FPS = 30;

// H.264 quality (lower = better/larger). 20 is visually lossless-ish for UI.
export const CRF = 20;

// Chromium leaves a grey window-background gutter around the recorded surface:
// ~24px on the right and ~52px below the (shorter-than-viewport) newtab page.
// Identical crop to record-demos.mjs — a real user never sees it.
export const CROP = "crop=in_w-24:in_h-52:0:0";

// ---- Preconditions ----------------------------------------------------------

export function assertFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    console.error("ffmpeg not found on PATH. Install ffmpeg to build the montage.");
    process.exit(1);
  }
}

// ---- Per-clip normalisation -------------------------------------------------

/**
 * Build the per-clip Ken Burns zoompan expression. `d=1` makes zoompan emit one
 * output frame per input frame (so it animates across the video instead of
 * panning a single still). The zoom creeps in each frame and is centred on a
 * focus point expressed as fractions of the frame (focusX/focusY in 0..1);
 * default top-centre to draw the eye to the search bar.
 */
function zoompanFilter(focusX, focusY) {
  // x/y are top-left of the zoom window in source pixels. Keeping the focus
  // point fixed on screen as we zoom: x = focus*iw - (focus*iw)/zoom, etc.
  const z = `min(zoom+${ZOOM_STEP},${ZOOM_MAX})`;
  const x = `${focusX}*iw - (${focusX}*iw)/zoom`;
  const y = `${focusY}*ih - (${focusY}*ih)/zoom`;
  // Render zoompan at the source size so we don't lose resolution before the
  // final scale/pad onto the canvas.
  return `zoompan=z='${z}':d=1:x='${x}':y='${y}':s=iw*ih*0:fps=${FPS}`;
}

// zoompan's `s` must be WxH, not an expression. Derive it from the cropped
// input via a probe so we keep full resolution; falls back to the canvas size.
function probeSize(input) {
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=s=x:p=0",
        input,
      ],
      { encoding: "utf8" },
    ).trim();
    const [w, h] = out.split("x").map(Number);
    if (w && h) return { w, h };
  } catch {
    /* fall through */
  }
  return { w: CANVAS_W, h: CANVAS_H };
}

/**
 * Normalise one recorded WebM into a montage-ready MP4 clip: crop the Chromium
 * gutter, apply a gentle pan/zoom toward the search bar, then letterbox-pad onto
 * the 16:9 canvas with a black background.
 *
 * @param {string} inputWebm
 * @param {string} outMp4
 * @param {{focusX?: number, focusY?: number}} [opts] focus point in 0..1 (default top-centre)
 */
export function normalizeClip(inputWebm, outMp4, opts = {}) {
  const focusX = opts.focusX ?? 0.5;
  const focusY = opts.focusY ?? 0.18; // search bar sits near the top
  // The cropped size is the source minus the gutter; zoompan needs a concrete
  // size, so probe the source and subtract the same gutter the crop removes.
  const { w, h } = probeSize(inputWebm);
  const zw = Math.max(2, w - 24);
  const zh = Math.max(2, h - 52);
  const zoom = zoompanFilter(focusX, focusY).replace("s=iw*ih*0", `s=${zw}x${zh}`);
  const filters = [
    CROP,
    zoom,
    `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=decrease`,
    `pad=${CANVAS_W}:${CANVAS_H}:(ow-iw)/2:(oh-ih)/2:black`,
    "format=yuv420p",
  ].join(",");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i", inputWebm,
      "-vf", filters,
      "-r", String(FPS),
      "-c:v", "libx264",
      "-crf", String(CRF),
      "-preset", "medium",
      "-pix_fmt", "yuv420p",
      "-an",
      outMp4,
    ],
    { stdio: "ignore" },
  );
  return outMp4;
}

// ---- Concatenation ----------------------------------------------------------

/**
 * Concatenate normalised MP4 clips into the final montage with hard cuts (concat
 * demuxer). This is the reliable path: the clips already share codec/size/fps,
 * and varying clip durations make xfade offset math fiddly.
 *
 * To upgrade to crossfades later: ffprobe each clip's duration, then chain
 * `xfade=transition=fade:duration=0.15:offset=<cumulative-0.15>` filters between
 * inputs (and `concat` the audio if any). Left as a hook deliberately.
 *
 * @param {string[]} mp4List ordered clip paths
 * @param {string} outMp4
 */
export function concatClips(mp4List, outMp4) {
  if (mp4List.length === 0) throw new Error("concatClips: no clips to concat");
  const listFile = path.join(os.tmpdir(), `ft-store-concat-${Date.now()}.txt`);
  const body = mp4List.map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listFile, body);
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listFile,
        // Re-encode once so the join is clean even if a clip's headers differ.
        "-c:v", "libx264",
        "-crf", String(CRF),
        "-preset", "medium",
        "-pix_fmt", "yuv420p",
        "-r", String(FPS),
        "-an",
        outMp4,
      ],
      { stdio: "ignore" },
    );
  } finally {
    fs.rmSync(listFile, { force: true });
  }
  return outMp4;
}
