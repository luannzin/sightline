// The host's side of a share: one captured screen, one room, everyone with the link watching.

import { captureScreen, captureSound, hint, newController } from "./capture";
import { inviteUrl, newSecret } from "./link";
import { setMode } from "./peer";
import type { Profile } from "./profile";
import { enter, type Session } from "./room";
import type { Mode } from "./tuning";

const META = { kind: "screen" };

/** A fresh room with its own secret; the link carries the host's id for this room. */
async function openRoom() {
  const secret = newSecret();
  const session = await enter(secret);
  try {
    const { userId } = await session.room.getSelf();
    return { session, link: inviteUrl({ secret, hostId: userId }, location) };
  } catch (error) {
    void session.room.leave();
    throw error;
  }
}

/** `profile` is null until their name and critter arrive. */
export type Watcher = { userId: string; profile: Profile | null; connections: RTCPeerConnection[] };

export class Share {
  link: string;
  /** What viewers receive: the screen's video, its sound, and the extra sound source. */
  readonly out: MediaStream;
  private screen: MediaStream;
  private extra: MediaStreamTrack | null = null;
  private stopped = false;
  private offs: (() => void)[] = [];

  private constructor(
    private session: Session,
    screen: MediaStream,
    link: string,
    private profile: Profile,
    private onChange: () => void,
    private onEnd: () => void,
  ) {
    this.screen = screen;
    this.link = link;
    this.out = new MediaStream(screen.getTracks());
    this.watchEnd();
    this.listen();
  }

  /** Asks for a screen, then opens the room. Throws if the person cancels the picker. */
  static async start(profile: Profile, mode: Mode, onChange: () => void, onEnd: () => void) {
    const ctl = newController();
    const screen = await captureScreen(ctl?.controller);
    ctl?.stayHere();
    hint(screen.getVideoTracks()[0], mode);
    setMode(mode);
    try {
      const { session, link } = await openRoom();
      const share = new Share(session, screen, link, profile, onChange, onEnd);
      await share.publish();
      return share;
    } catch (error) {
      for (const t of screen.getTracks()) t.stop();
      throw error;
    }
  }

  get sound() {
    return {
      screen: this.screen.getAudioTracks().length > 0,
      // a monitor's sound is the whole computer's mix; a tab or window can be just its own
      wholeScreen: this.screen.getVideoTracks()[0]?.getSettings().displaySurface === "monitor",
      extra: this.extra,
    };
  }

  watchers(): Watcher[] {
    const { room, profiles } = this.session;
    const peers = Object.values(room.getPeers());
    return Object.keys(room.getUsers()).map((userId) => ({
      userId,
      profile: profiles.has(userId) ? profiles.get(userId) : null,
      connections: peers.flatMap((p) =>
        p.userId === userId && p.connection ? [p.connection] : [],
      ),
    }));
  }

  /** A new name or critter, shown to everyone watching right away. */
  async setProfile(profile: Profile) {
    if (this.stopped) return;
    this.profile = profile;
    await this.session.show.set((s) => ({ ...s, ...profile }));
  }

  setMode(mode: Mode) {
    hint(this.screen.getVideoTracks()[0], mode);
    setMode(mode);
  }

  /** Picks another screen, window or tab; the link stays the same. */
  async changeSource(mode: Mode) {
    const ctl = newController();
    const next = await captureScreen(ctl?.controller);
    ctl?.stayHere();
    hint(next.getVideoTracks()[0], mode);
    // Swap in place where both have the kind: removing every track at once and adding new ones
    // makes the viewer's browser put them in a new stream, and the player stays on the old, empty
    // one. Only a sound that appears or goes away renegotiates.
    for (const kind of ["video", "audio"]) {
      const old = this.screen.getTracks().find((t) => t.kind === kind);
      const fresh = next.getTracks().find((t) => t.kind === kind);
      // it only rejects for a viewer leaving mid-swap; the others get the new track anyway, and
      // throwing here would leave the new capture running with nothing holding it
      if (old && fresh) await this.session.room.replaceTrack(old, fresh).catch(() => {});
      if (old) {
        this.out.removeTrack(old);
        old.stop();
      }
      if (fresh) this.out.addTrack(fresh);
    }
    this.screen = next;
    this.watchEnd();
    await this.publish();
  }

  /** Sends a sound input too: a mic, or desktop sound exposed as an input on Linux. */
  async addSound(deviceId?: string) {
    const [track] = (await captureSound(deviceId)).getAudioTracks();
    this.dropExtra();
    this.extra = track;
    this.out.addTrack(track);
    await this.publish();
  }

  async removeSound() {
    this.dropExtra();
    await this.publish();
  }

  /**
   * A new link for the same capture: whoever has the old one is cut off, nothing is re-picked.
   * False when the share stopped meanwhile. On failure the old link keeps working.
   */
  async resetLink() {
    if (this.stopped) return false;
    const next = await openRoom();
    if (this.stopped) {
      void next.session.room.leave();
      return false;
    }
    const old = { session: this.session, link: this.link };
    for (const off of this.offs) off();
    this.session = next.session;
    this.link = next.link;
    this.listen();
    try {
      await this.publish();
    } catch (error) {
      for (const off of this.offs) off();
      void next.session.room.leave();
      this.session = old.session;
      this.link = old.link;
      // stop() ran meanwhile and only left the new room: the old one has to go too
      if (this.stopped) void old.session.room.leave();
      else this.listen();
      throw error;
    }
    // the old room's viewers see "ended" instead of waiting a minute for a reconnect
    await old.session.show.set({ ...this.profile, live: false, sound: false }).catch(() => {});
    await old.session.room.leave();
    return !this.stopped;
  }

  async remove(userId: string) {
    await this.session.room.ban(userId);
    this.onChange();
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const off of this.offs) off();
    for (const t of this.out.getTracks()) t.stop();
    await this.session.show.set({ ...this.profile, live: false, sound: false }).catch(() => {});
    await this.session.room.leave();
  }

  private listen() {
    const { room, profiles } = this.session;
    // newcomers get the stream as they arrive; everyone else already has it
    this.offs = [
      room.onUserJoin(({ userId }) => {
        void room.addStream(this.out, { target: userId, metadata: META });
        this.onChange();
      }),
      room.onUserLeave(this.onChange),
      profiles.onChange(this.onChange),
    ];
  }

  /** Syncs the outgoing tracks to every viewer (Trystero adds and removes the difference). */
  private async publish() {
    await this.session.room.addStream(this.out, { metadata: META });
    await this.session.show.set({
      ...this.profile,
      live: true,
      sound: this.out.getAudioTracks().length > 0,
    });
    this.onChange();
  }

  private dropExtra() {
    if (!this.extra) return;
    this.out.removeTrack(this.extra);
    this.extra.stop();
    this.extra = null;
  }

  /** The browser's own "Stop sharing" button ends the video track: end the share with it. */
  private watchEnd() {
    const video = this.screen.getVideoTracks()[0];
    video?.addEventListener(
      "ended",
      () => {
        if (this.screen.getVideoTracks()[0] !== video) return; // replaced, not stopped
        void this.stop().then(this.onEnd);
      },
      { once: true },
    );
  }
}
