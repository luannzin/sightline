// Per-browser conveniences. Storage can be missing or throw (private windows, blocked site
// data), so every read falls back to a default and every write is best effort.

import type { TurnServerConfig } from "trystero";
import { randomSeed } from "./avatar";
import { cleanName, isProfile, type Profile, randomName } from "./profile";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`sightline:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(`sightline:${key}`, JSON.stringify(value));
  } catch {
    // nothing to do: it just won't be remembered
  }
}

export type Turn = { url: string; username: string; credential: string };

export const settings = {
  /** This browser's name and critter, made up the first time and kept from then on. */
  profile: (): Profile => {
    const saved = read<unknown>("profile", null);
    if (isProfile(saved) && saved.name) return saved;
    // a name typed before profiles existed is kept
    const fresh = { name: cleanName(read("name", "")) || randomName(), avatar: randomSeed() };
    write("profile", fresh);
    return fresh;
  },
  setProfile: (profile: Profile) => write("profile", profile),
  // 0 was saved as a level before muting had its own state: treat it as unset, or sound never comes back
  volume: () => read("volume", 1) || 1,
  setVolume: (volume: number) => write("volume", volume),
  turn: () => read<Turn>("turn", { url: "", username: "", credential: "" }),
  setTurn: (turn: Turn) => write("turn", turn),
};

/** The TURN server, in Trystero's shape, or nothing when none is set. */
export function turnConfig(): TurnServerConfig[] | undefined {
  const { url, username, credential } = settings.turn();
  return url ? [{ urls: url, username, credential }] : undefined;
}
