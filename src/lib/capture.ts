// Screen capture, and what this browser can do with sound.

import { MODES, type Mode } from "./tuning";

// Chromium's, not in the DOM typings yet.
declare class CaptureController {
  setFocusBehavior(behavior: "focus-captured-surface" | "no-focus-change"): void;
}

export const canShare =
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

// Sound off the wire as captured: no echo cancelling, gating or levelling on music and games.
const RAW_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
  sampleRate: 48_000,
};

/** Asks for a screen, window or tab. Throws NotAllowedError when the person cancels. */
export async function captureScreen(controller?: CaptureController) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor", frameRate: { ideal: 60 } },
    audio: { ...RAW_AUDIO, suppressLocalAudioPlayback: false },
    controller,
    // Chromium-only hints; the others ignore them
    systemAudio: "include",
    surfaceSwitching: "include",
    selfBrowserSurface: "exclude",
    monitorTypeSurfaces: "include",
    // a window offers its own sound rather than the whole computer's (Chrome 141+), so a
    // call's voices don't go out with it
    windowAudio: "window",
  } as DisplayMediaStreamOptions);
  return stream;
}

/** A sound input (a mic, or a desktop-sound source on Linux) sent alongside the screen. */
export function captureSound(deviceId?: string) {
  return navigator.mediaDevices.getUserMedia({
    audio: { ...RAW_AUDIO, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
  });
}

export function hint(track: MediaStreamTrack | undefined, mode: Mode) {
  if (track) track.contentHint = MODES[mode].hint;
}

/** Keeps the captured app in front instead of jumping to it (Chromium). */
export function newController() {
  if (typeof CaptureController === "undefined") return undefined;
  const controller = new CaptureController();
  return {
    controller,
    // must run right after getDisplayMedia resolves, before the task ends
    stayHere: () => {
      try {
        controller.setFocusBehavior("no-focus-change");
      } catch {
        // tab captures and other browsers don't support it
      }
    },
  };
}

export type SoundSupport = "full" | "mac" | "tab-only" | "none";

/** Where this browser gets sound from when sharing (from what each engine ships today). */
export function soundSupport(): SoundSupport {
  const ua = navigator.userAgent;
  const chromium = /Chrome\//.test(ua) && !/Firefox\//.test(ua);
  if (!chromium) return "none"; // Firefox and Safari capture no sound at all
  if (/Windows|CrOS/.test(ua)) return "full";
  if (/Macintosh/.test(ua)) return "mac";
  return "tab-only"; // Linux: tabs only, unless desktop sound is added as an input
}
