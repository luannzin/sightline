import {
  CheckIcon,
  CopyIcon,
  Link2Icon,
  MonitorUpIcon,
  RefreshCwIcon,
  SquareIcon,
  UserXIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Dusk } from "@/components/dusk";
import { LinkMeter } from "@/components/link";
import { getProfile, useProfile } from "@/components/profile";
import { Page } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { canShare, type SoundSupport, soundSupport } from "@/lib/capture";
import { detectHardware } from "@/lib/peer";
import { Share, type Watcher } from "@/lib/share";
import { formatRate, ROUTE_NAMES, readStats, type Stats } from "@/lib/stats";
import type { Mode } from "@/lib/tuning";

const README_LINUX = "https://github.com/luannzin/sightline#sound-on-linux";

export function Host() {
  const [share, setShare] = useState<Share | null>(null);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<Mode>("sharp");
  const [, rerender] = useState(0);
  const support = useRef<SoundSupport>(soundSupport()).current;

  useEffect(() => void detectHardware(), []);

  // Closing or reloading the tab ends the share for everyone: ask first, and if they go anyway,
  // tell the viewers it's over rather than leave them waiting for a reconnect.
  useEffect(() => {
    if (!share) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const end = () => void share.stop();
    addEventListener("beforeunload", warn);
    addEventListener("pagehide", end);
    return () => {
      removeEventListener("beforeunload", warn);
      removeEventListener("pagehide", end);
      // Leaving this screen (a link opened in this tab) would leave the capture running unseen.
      // Safe under StrictMode: its double run happens on mount, when there's no share yet; after
      // Stop it's a no-op.
      end();
    };
  }, [share]);

  const start = async () => {
    setStarting(true);
    try {
      const next = await Share.start(
        getProfile(),
        mode,
        () => rerender((n) => n + 1),
        () => {
          setShare(null);
          toastManager.add({ title: "Sharing stopped" });
        },
      );
      setShare(next);
      navigator.clipboard.writeText(next.link).then(
        () =>
          toastManager.add({
            title: "Link copied",
            description: "Send it to whoever should watch.",
          }),
        () => {}, // the click that started this may be too old to allow it: there's a button
      );
    } catch (error) {
      // cancelling the picker is a choice, not an error
      if ((error as DOMException).name !== "NotAllowedError")
        toastManager.add({
          type: "error",
          title: "Unable to start sharing",
          description: (error as Error).message || "Check your connection and try again.",
        });
    } finally {
      setStarting(false);
    }
  };

  if (share)
    return (
      <Live
        share={share}
        mode={mode}
        support={support}
        onMode={(m) => {
          setMode(m);
          share.setMode(m);
        }}
        onStop={() => {
          void share.stop();
          setShare(null);
        }}
      />
    );

  // The frame is where your screen will show: the one action sits in it, first on the page.
  return (
    <Page>
      <Dusk className="art-edge grid aspect-video w-full place-items-center rounded-[14px] p-4">
        {canShare ? (
          <Button
            size="xl"
            loading={starting}
            onClick={() => void start()}
            className="shadow-black/40 shadow-lg"
          >
            <MonitorUpIcon aria-hidden="true" />
            Share your screen
          </Button>
        ) : (
          <p className="relative max-w-xs rounded-[10px] bg-black/60 px-4 py-3 text-center text-pretty text-white backdrop-blur">
            Sharing needs a computer. Phones and tablets can still watch a link someone sends.
          </p>
        )}
      </Dusk>
      {canShare && (
        <div className="mt-3">
          <SoundNote support={support} />
        </div>
      )}
      <p className="mt-8 text-pretty text-foreground/70 leading-relaxed">
        Share your screen and send the link. Whoever opens it watches in their browser, with the
        video going straight from your computer to theirs. No account, no app, nothing to install.
      </p>
    </Page>
  );
}

function SoundNote({ support }: { support: SoundSupport }) {
  const note = {
    full: "To send sound too, turn on the audio option in the picker.",
    mac: "To send sound too, turn on the audio option in the picker. A whole screen's sound needs macOS 14.2 or later; a tab's sound works on any version.",
    "tab-only":
      "Chrome on Linux sends sound only from a tab. For your whole computer's sound, add desktop sound as a source once you're sharing.",
    none: "This browser can't send sound. Open Sightline in Chrome or Edge to share with sound.",
  }[support];
  return (
    <p className="text-pretty text-muted-foreground text-sm">
      {note}{" "}
      {support === "tab-only" && (
        <a href={README_LINUX} className="underline underline-offset-4 hover:text-foreground">
          Set up desktop sound
        </a>
      )}
    </p>
  );
}

function Live({
  share,
  mode,
  support,
  onMode,
  onStop,
}: {
  share: Share;
  mode: Mode;
  support: SoundSupport;
  onMode: (mode: Mode) => void;
  onStop: () => void;
}) {
  const preview = useRef<HTMLVideoElement>(null);
  const watchers = share.watchers();
  const profile = useProfile();

  useEffect(() => {
    if (preview.current) preview.current.srcObject = share.out;
  }, [share]);

  // a new name or critter goes out to everyone watching as soon as it's saved
  useEffect(() => void share.setProfile(profile).catch(() => {}), [share, profile]);

  // say who came in, once their name arrives, so there's no need to watch the list
  const announced = useRef(new Set<string>());
  useEffect(() => {
    for (const w of watchers) {
      if (!w.profile || announced.current.has(w.userId)) continue;
      announced.current.add(w.userId);
      toastManager.add({ title: `${w.profile.name || "Someone"} is watching` });
    }
  });

  return (
    <Page>
      <figure className="relative">
        <video
          ref={preview}
          autoPlay
          muted
          playsInline
          className="art-edge aspect-video w-full rounded-[14px] bg-black object-contain"
        />
        <figcaption className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 text-sm text-white backdrop-blur">
          <span aria-hidden="true" className="size-2 rounded-full bg-red-500" />
          Live
          <span className="text-white/60">·</span>
          <span className="tabular-nums">
            {watchers.length === 1 ? "1 watching" : `${watchers.length} watching`}
          </span>
        </figcaption>
      </figure>

      {/* what you do to the share itself sits right under it */}
      <div className="mt-3 flex flex-wrap justify-end gap-3">
        <Button
          variant="outline"
          onClick={() =>
            share.changeSource(mode).catch((error: DOMException) => {
              if (error.name !== "NotAllowedError")
                toastManager.add({
                  type: "error",
                  title: "Unable to change the source",
                  description: error.message,
                });
            })
          }
        >
          <RefreshCwIcon aria-hidden="true" />
          Change source
        </Button>
        <Button variant="destructive-outline" onClick={onStop}>
          <SquareIcon aria-hidden="true" />
          Stop sharing
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-8">
        <LinkField share={share} />

        <div className="flex flex-col items-start gap-2">
          <span id="mode-label" className="font-medium text-sm">
            Best for
          </span>
          <ToggleGroup
            aria-labelledby="mode-label"
            aria-describedby="mode-description"
            variant="outline"
            value={[mode]}
            onValueChange={(v) => v[0] && onMode(v[0] as Mode)}
          >
            <ToggleGroupItem value="sharp">Text</ToggleGroupItem>
            <ToggleGroupItem value="smooth">Motion</ToggleGroupItem>
          </ToggleGroup>
          <p id="mode-description" className="text-muted-foreground text-sm">
            {mode === "sharp"
              ? "Keeps small text and code crisp."
              : "Keeps video and games smooth."}
          </p>
        </div>

        <Sound share={share} support={support} />
        <Watching share={share} watchers={watchers} />
      </div>
    </Page>
  );
}

function LinkField({ share }: { share: Share }) {
  const { link } = share;
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Field>
      <FieldLabel>Link</FieldLabel>
      <div className="flex w-full gap-3">
        <Input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 font-mono"
        />
        <Button
          onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
          className="min-w-28"
        >
          <span className="relative size-4">
            <CopyIcon
              aria-hidden="true"
              className="absolute inset-0 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-[off]:scale-25 data-[off]:opacity-0 data-[off]:blur-[4px]"
              data-off={copied || undefined}
            />
            <CheckIcon
              aria-hidden="true"
              className="absolute inset-0 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-[off]:scale-25 data-[off]:opacity-0 data-[off]:blur-[4px]"
              data-off={!copied || undefined}
            />
          </span>
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          variant="outline"
          loading={resetting}
          onClick={() => {
            setResetting(true);
            share
              .resetLink()
              .then((done) => {
                if (!done) return; // sharing stopped meanwhile: there's no link to send
                toastManager.add({
                  title: "New link",
                  description: "The old one stopped working. Copy this one and send it.",
                });
              })
              .catch((error: Error) =>
                toastManager.add({
                  type: "error",
                  title: "Unable to make a new link",
                  description: error.message || "Check your connection and try again.",
                }),
              )
              .finally(() => setResetting(false));
          }}
        >
          <Link2Icon aria-hidden="true" />
          New link
        </Button>
      </div>
      <FieldDescription>
        Anyone with this link can watch until you stop sharing. A new link cuts off everyone on the
        old one, without stopping the share.
      </FieldDescription>
    </Field>
  );
}

function Sound({ share, support }: { share: Share; support: SoundSupport }) {
  const { screen, wholeScreen, extra } = share.sound;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!extra) return;
    const list = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => setDevices(all.filter((d) => d.kind === "audioinput" && d.deviceId)));
    void list();
    navigator.mediaDevices.addEventListener("devicechange", list);
    return () => navigator.mediaDevices.removeEventListener("devicechange", list);
  }, [extra]);

  const run = (task: () => Promise<void>) => {
    setBusy(true);
    task()
      .catch((error: DOMException) =>
        toastManager.add({
          type: "error",
          title: "Unable to use that sound source",
          description:
            error.name === "NotAllowedError"
              ? "Allow access to it in the browser's site settings."
              : error.message,
        }),
      )
      .finally(() => setBusy(false));
  };

  const items = devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Input ${i + 1}` }));
  const current = extra?.getSettings().deviceId;

  return (
    <section aria-labelledby="sound-heading" className="flex flex-col gap-3">
      <h2 id="sound-heading" className="font-medium">
        Sound
      </h2>
      <p className="text-muted-foreground">
        {screen
          ? wholeScreen
            ? "Sending your whole computer's sound, a call you're in included. To keep a call out, share a tab or a single window instead."
            : "Sending the sound from what you're sharing."
          : support === "full" || support === "mac"
            ? "What you're sharing has no sound. To add it, click Change source and turn on the audio option in the picker."
            : "What you're sharing has no sound."}
        {extra && " Also sending a sound source."}
      </p>
      {extra ? (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            items={items}
            value={current ?? null}
            onValueChange={(id) => id && id !== current && run(() => share.addSound(id as string))}
          >
            <SelectTrigger aria-label="Sound source" className="w-72 max-w-full">
              <SelectValue placeholder="Sound source" />
            </SelectTrigger>
            <SelectPopup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Button variant="ghost" disabled={busy} onClick={() => run(() => share.removeSound())}>
            Remove sound source
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="outline" loading={busy} onClick={() => run(() => share.addSound())}>
            Add a sound source
          </Button>
          <p className="mt-2 text-muted-foreground text-sm">
            A mic, or on Linux, your desktop sound.{" "}
            <a href={README_LINUX} className="underline underline-offset-4 hover:text-foreground">
              How to set up desktop sound
            </a>
          </p>
        </div>
      )}
    </section>
  );
}

function Watching({ share, watchers }: { share: Share; watchers: Watcher[] }) {
  const stats = useWatcherStats(watchers);
  return (
    <section aria-labelledby="watching-heading" className="flex flex-col gap-3">
      <h2 id="watching-heading" className="font-medium">
        Watching
      </h2>
      {watchers.length === 0 ? (
        <p className="text-muted-foreground">Nobody yet. Send the link to someone.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {watchers.map((w) => {
            const s = stats[w.userId];
            const label = w.profile?.name || "Someone";
            return (
              <li key={w.userId} className="flex min-h-11 items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar seed={w.profile?.avatar ?? 0} />
                  <div className="min-w-0 leading-snug">
                    <p className="truncate">{label}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm tabular-nums">
                      <LinkMeter stats={s ?? null} />
                      <span>{s ? describe(s) : "Connecting…"}</span>
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive-outline"
                  size="sm"
                  aria-label={`Remove ${label}`}
                  onClick={() => void share.remove(w.userId)}
                >
                  <UserXIcon aria-hidden="true" />
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function describe(s: Stats) {
  const parts = [ROUTE_NAMES[s.route], formatRate(s.kbps)];
  if (s.rttMs !== null) parts.push(`${s.rttMs} ms`);
  if (s.limit === "cpu") parts.push("held back by your CPU");
  if (s.limit === "bandwidth") parts.push("held back by bandwidth");
  return parts.join(" · ");
}

/** Reads each watcher's connection every two seconds. */
function useWatcherStats(watchers: Watcher[]) {
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const latest = useRef(watchers);
  latest.current = watchers;

  useEffect(() => {
    const samples = new Map<RTCPeerConnection, { bytes: number; at: number }>();
    const tick = async () => {
      const next: Record<string, Stats> = {};
      for (const w of latest.current) {
        for (const pc of w.connections) {
          const read = await readStats(pc, samples.get(pc)).catch(() => null);
          if (!read) continue;
          samples.set(pc, read.sample);
          next[w.userId] = read.stats;
        }
      }
      setStats(next);
    };
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, []);

  return stats;
}
