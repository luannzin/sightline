import {
  ActivityIcon,
  MaximizeIcon,
  MinimizeIcon,
  MonitorUpIcon,
  PictureInPicture2Icon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Dusk } from "@/components/dusk";
import { LinkMeter, Sweep } from "@/components/link";
import { NetworkSettings } from "@/components/network-settings";
import { getProfile, ProfileDialog, useProfile } from "@/components/profile";
import { Page } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Slider } from "@/components/ui/slider";
import { toastManager } from "@/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import type { Invite } from "@/lib/link";
import { enter, OFF_AIR, type Session, type Show } from "@/lib/room";
import { settings } from "@/lib/settings";
import { formatRate, ROUTE_NAMES, readStats, type Stats } from "@/lib/stats";
import { cn } from "@/lib/utils";

type Phase = "joining" | "live" | "reconnecting" | "ended" | "removed";

/** How long a dropped host gets to come back before it's over: Deskline's minute. */
const GRACE_MS = 60_000;

// Opening the link is the click: it starts connecting straight away, and the viewer is already
// someone (a random name and critter they can change at any time), so there's nothing to fill in.
export function Viewer({ invite }: { invite: Invite }) {
  const [phase, setPhase] = useState<Phase>("joining");
  const [session, setSession] = useState<Session | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [show, setShow] = useState<Show>(OFF_AIR);
  const [blocked, setBlocked] = useState(false);
  const [slow, setSlow] = useState(false);
  const profile = useProfile();

  const active = phase !== "ended" && phase !== "removed";
  useEffect(() => {
    if (!active) return;
    let gone = false;
    let current: Session | null = null;
    let live = false; // the host's last word on whether it's still sharing
    let lost = 0;
    const offs: (() => void)[] = [];
    const slowTimer = setTimeout(() => setSlow(true), 20_000);

    // a tick late, so a mount that's undone at once (React's dev double mount) never joins:
    // Trystero allows one join per room at a time
    const joinTimer = setTimeout(join);
    return () => {
      gone = true;
      clearTimeout(joinTimer);
      clearTimeout(slowTimer);
      clearTimeout(lost);
      for (const off of offs) off();
      void current?.room.leave();
      setSession(null);
    };

    function join() {
      enter(invite.secret, invite.hostId).then(
        (s) => {
          if (gone) return void s.room.leave();
          current = s;
          setSession(s);
          offs.push(
            // only the host's stream; the host's id came with the link and Trystero verifies it
            s.room.onPeerStream(
              (incoming, { userId }) => {
                if (userId !== invite.hostId) return;
                clearTimeout(lost);
                setStream(incoming);
                setPhase("live");
              },
              { replay: true },
            ),
            s.show.onChange(
              (value) => {
                if (!s.show.getMeta()) return; // the default, before the host's state arrives
                live = value.live;
                setShow(value);
                if (!value.live) setPhase("ended");
              },
              { replay: true },
            ),
            s.room.onUserLeave(({ userId }) => {
              if (userId !== invite.hostId) return;
              if (!live) return setPhase("ended");
              // gone without saying it stopped: a dropped link, so keep the picture and wait
              clearTimeout(lost);
              setPhase("reconnecting");
              lost = window.setTimeout(() => setPhase("ended"), GRACE_MS);
            }),
            s.room.onError((error) => {
              if (error.code === "banned") setPhase("removed");
              if (error.code === "peer-connect-failed") setBlocked(true);
            }),
          );
        },
        () => setBlocked(true),
      );
    }
  }, [active, invite]);

  // who you are goes to the room on joining, and again whenever you change it
  useEffect(() => void session?.profiles.set(profile).catch(() => {}), [session, profile]);

  // stop listening once it's over, so the room closes and the camera-style indicators go away
  useEffect(() => {
    if (!active) setStream(null);
  }, [active]);

  if ((phase === "live" || phase === "reconnecting") && stream && session)
    return (
      <Stage
        stream={stream}
        show={show}
        session={session}
        hostId={invite.hostId}
        reconnecting={phase === "reconnecting"}
      />
    );

  return (
    <Page>
      <Dusk className="art-edge grid aspect-video w-full place-items-center rounded-[14px]">
        {phase === "joining" && (
          <div className="relative flex items-center gap-3 rounded-full bg-black/60 py-2 ps-3 pe-4 text-white backdrop-blur">
            <Sweep />
            {show.name ? `Connecting to ${show.name}…` : "Connecting…"}
          </div>
        )}
      </Dusk>
      <div role="status" className="mt-8 text-pretty text-foreground/70 leading-relaxed">
        {phase === "joining" && !blocked && (
          <p>
            {slow
              ? "Still trying. If it doesn't connect, the share may have ended. Ask for a new link."
              : "This usually takes a few seconds."}
          </p>
        )}
        {phase === "joining" && blocked && (
          <p>
            Unable to connect to the host directly. A network on one side is blocking it, which a
            relay server usually gets around.
          </p>
        )}
        {phase === "ended" && (
          <p>{show.name ? `${show.name} stopped sharing.` : "The share ended."}</p>
        )}
        {phase === "removed" && <p>The host removed you from this share.</p>}
      </div>
      {phase === "joining" && blocked && (
        <div className="mt-6">
          <NetworkSettings trigger="Set a relay server" variant="outline" />
        </div>
      )}
      {!active && (
        <div className="mt-6">
          <Button variant="outline" onClick={() => (location.hash = "")}>
            <MonitorUpIcon aria-hidden="true" />
            Share your own screen
          </Button>
        </div>
      )}
    </Page>
  );
}

// once per page: the stage can come and go with reconnects, the greeting shouldn't
let greeted = false;

/** The live screen, edge to edge, with controls that get out of the way. */
function Stage({
  stream,
  show,
  session,
  hostId,
  reconnecting,
}: {
  stream: MediaStream;
  show: Show;
  session: Session;
  hostId: string;
  reconnecting: boolean;
}) {
  const stage = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  // the browser wouldn't play sound before a click on the page: playing muted until there is one
  const [soundLocked, setSoundLocked] = useState(false);
  const [volume, setVolume] = useState(settings.volume);
  const [blockedPlay, setBlockedPlay] = useState(false);
  const [full, setFull] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [editing, setEditing] = useState(false);
  const [awake, setAwake] = useState(true);
  const sleepTimer = useRef(0);
  const stats = useHostStats(session, hostId);

  // the host can change source or add sound: re-attach so the element picks up new tracks
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const attach = () => {
      el.srcObject = stream;
      el.play().then(
        () => setBlockedPlay(false),
        () => {
          // no click on this page yet: browsers allow muted video, so start with the picture
          el.muted = true;
          setMuted(true);
          setSoundLocked(true);
          el.play().then(
            () => setBlockedPlay(false),
            () => setBlockedPlay(true),
          );
        },
      );
    };
    attach();
    stream.addEventListener("addtrack", attach);
    stream.addEventListener("removetrack", attach);
    return () => {
      stream.removeEventListener("addtrack", attach);
      stream.removeEventListener("removetrack", attach);
    };
  }, [stream]);

  useEffect(() => {
    if (!video.current) return;
    video.current.muted = muted;
    video.current.volume = volume;
  }, [muted, volume]);

  // any click or key on the page is the gesture the browser wanted: the sound comes on with it
  useEffect(() => {
    if (!soundLocked) return;
    const unlock = () => {
      setSoundLocked(false);
      setMuted(false);
    };
    addEventListener("pointerdown", unlock, { once: true });
    addEventListener("keydown", unlock, { once: true });
    return () => {
      removeEventListener("pointerdown", unlock);
      removeEventListener("keydown", unlock);
    };
  }, [soundLocked]);

  useEffect(() => {
    if (greeted) return;
    greeted = true;
    toastManager.add({
      title: `You're watching as ${getProfile().name}`,
      description: "Everyone here sees this name and critter.",
      actionProps: { children: "Change", onClick: () => setEditing(true) },
    });
  }, []);

  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) return void document.exitFullscreen();
    const el = stage.current;
    if (el?.requestFullscreen) return void el.requestFullscreen().catch(() => {});
    // iPhone: only the video element itself can go full screen
    (
      video.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
    )?.webkitEnterFullscreen?.();
  }, []);

  const wake = useCallback(() => {
    setAwake(true);
    clearTimeout(sleepTimer.current);
    sleepTimer.current = window.setTimeout(() => {
      // keep the controls while someone's using them
      if (!stage.current?.querySelector("[data-controls]:hover, [data-controls]:focus-within"))
        setAwake(false);
    }, 2500);
  }, []);

  useEffect(() => {
    wake();
    const keys = (e: KeyboardEvent) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target as HTMLElement).closest("input, [role=slider], [role=dialog]")
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "f") toggleFull();
      else if (key === "m") setMuted((m) => !m);
      else if (key === "i") setShowStats((s) => !s);
      else return;
      e.preventDefault();
      wake();
    };
    addEventListener("keydown", keys);
    return () => {
      removeEventListener("keydown", keys);
      clearTimeout(sleepTimer.current);
    };
  }, [toggleFull, wake]);

  const title = show.name ? `${show.name}'s screen` : "Shared screen";
  const canPip = typeof document !== "undefined" && document.pictureInPictureEnabled;
  const hasSound = stream.getAudioTracks().length > 0;

  return (
    <main
      ref={stage}
      className="relative h-dvh w-full overflow-hidden bg-black data-[asleep]:cursor-none"
      data-asleep={!awake || undefined}
      data-stage
      onPointerMove={wake}
      onPointerDown={wake}
      // tabbing into hidden controls brings them back, so focus is never invisible
      onFocus={wake}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: a live screen has no captions to load */}
      <video
        ref={video}
        autoPlay
        playsInline
        className="size-full object-contain"
        onDoubleClick={toggleFull}
        aria-label={title}
      />

      {reconnecting && (
        <div className="absolute inset-0 grid place-items-center bg-black/40">
          <div
            role="status"
            className="flex items-center gap-3 rounded-[10px] bg-black/80 px-4 py-3 text-white"
          >
            <Sweep />
            {show.name ? `Lost ${show.name}. Reconnecting…` : "Reconnecting…"}
          </div>
        </div>
      )}

      {blockedPlay && (
        <div className="absolute inset-0 grid place-items-center bg-black/60">
          <Button size="lg" onClick={() => video.current?.play().then(() => setBlockedPlay(false))}>
            <PlayIcon aria-hidden="true" />
            Play
          </Button>
        </div>
      )}

      {/* top, clear of the toasts and controls at the bottom; any click or key turns it on */}
      {soundLocked && hasSound && !blockedPlay && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(max(1rem,env(safe-area-inset-top))+4rem)] flex justify-center px-4">
          <Button size="lg" className="pointer-events-auto shadow-black/40 shadow-lg">
            <Volume2Icon aria-hidden="true" />
            Turn on sound
          </Button>
        </div>
      )}

      <div
        className="group pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-linear-to-b from-black/70 to-transparent px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10 text-white transition-opacity duration-300 data-[asleep]:opacity-0"
        data-asleep={!awake || undefined}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar seed={show.avatar} />
          {/* wraps rather than truncates, so a long name is never cut off */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0 font-medium leading-snug [overflow-wrap:anywhere]">
              {title}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-sm backdrop-blur">
              <span
                aria-hidden="true"
                className={cn("size-2 rounded-full", reconnecting ? "bg-warning" : "bg-red-500")}
              />
              {reconnecting ? "Reconnecting" : "Live"}
            </span>
            <LinkMeter stats={reconnecting ? null : stats} className="max-sm:hidden" />
          </div>
        </div>
        <Audience session={session} hostId={hostId} onEdit={() => setEditing(true)} />
      </div>

      {/* asked for with I, so it stays while the rest of the controls sleep */}
      {showStats && (
        <div className="pointer-events-none absolute end-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] text-white">
          <StatsPanel stats={stats} />
        </div>
      )}

      <div
        data-controls
        className="dark absolute inset-x-0 bottom-0 flex items-center gap-1 bg-linear-to-t from-black/70 to-transparent px-3 pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white transition-opacity duration-300 data-[asleep]:pointer-events-none data-[asleep]:opacity-0"
        data-asleep={!awake || undefined}
      >
        <Control label={muted ? "Unmute" : "Mute"} shortcut="M" onClick={() => setMuted((m) => !m)}>
          {muted || volume === 0 ? (
            <VolumeXIcon aria-hidden="true" />
          ) : (
            <Volume2Icon aria-hidden="true" />
          )}
        </Control>
        {/* phones set volume with their buttons, and iOS ignores it from the page */}
        <Slider
          aria-label="Volume"
          className="px-2 pointer-coarse:hidden data-[orientation=horizontal]:w-28"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onValueChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            // 0 means muted, not a level: unmuting brings back the last one
            setMuted(next === 0);
            if (next === 0) return;
            setVolume(next);
            settings.setVolume(next);
          }}
        />
        <div className="flex-1" />
        <Control
          label={showStats ? "Hide stats" : "Show stats"}
          shortcut="I"
          onClick={() => setShowStats((s) => !s)}
        >
          <ActivityIcon aria-hidden="true" />
        </Control>
        {canPip && (
          <Control
            label="Picture in picture"
            onClick={() => void video.current?.requestPictureInPicture().catch(() => {})}
          >
            <PictureInPicture2Icon aria-hidden="true" />
          </Control>
        )}
        <Control
          label={full ? "Exit full screen" : "Full screen"}
          shortcut="F"
          onClick={toggleFull}
        >
          {full ? <MinimizeIcon aria-hidden="true" /> : <MaximizeIcon aria-hidden="true" />}
        </Control>
      </div>

      <ProfileDialog open={editing} onOpenChange={setEditing} container={stage.current} />
    </main>
  );
}

const CROWD = 4;

/** Who's here: you first (a click to change your name and critter), then everyone else. */
function Audience({
  session,
  hostId,
  onEdit,
}: {
  session: Session;
  hostId: string;
  onEdit: () => void;
}) {
  const me = useProfile();
  const [, rerender] = useState(0);
  useEffect(() => {
    const update = () => rerender((n) => n + 1);
    const offs = [
      session.profiles.onChange(update),
      session.room.onUserJoin(update),
      session.room.onUserLeave(update),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [session]);

  const others = Object.keys(session.room.getUsers())
    .filter((id) => id !== hostId)
    .map((id) => {
      const p = session.profiles.has(id) ? session.profiles.get(id) : null;
      return { id, name: p?.name || "Someone", avatar: p?.avatar ?? 0 };
    });

  return (
    <div
      data-controls
      className="pointer-events-auto flex items-center gap-1.5 group-data-[asleep]:pointer-events-none"
    >
      {others.length > 0 && <span className="sr-only">Also watching:</span>}
      {others.slice(0, CROWD).map((o) => (
        <Tooltip key={o.id}>
          <TooltipTrigger render={<span className="rounded-[8px]" />}>
            <Avatar seed={o.avatar} label={o.name} />
          </TooltipTrigger>
          <TooltipPopup>{o.name}</TooltipPopup>
        </Tooltip>
      ))}
      {others.length > CROWD && (
        <span className="px-1 text-sm text-white/70 tabular-nums">+{others.length - CROWD}</span>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`You, ${me.name}. Change your name and critter`}
              onClick={onEdit}
              className="cursor-pointer rounded-[8px] outline-offset-2 outline-white ring-2 ring-white/70 ring-offset-2 ring-offset-black/60 transition-shadow duration-150 hover:ring-white focus-visible:outline-2"
            />
          }
        >
          <Avatar seed={me.avatar} />
        </TooltipTrigger>
        <TooltipPopup>You · {me.name}</TooltipPopup>
      </Tooltip>
    </div>
  );
}

function Control({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xl"
            aria-label={label}
            onClick={onClick}
            className="text-white hover:bg-white/10 focus-visible:ring-white"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup>
        {label}
        {shortcut && <Kbd className="ms-2">{shortcut}</Kbd>}
      </TooltipPopup>
    </Tooltip>
  );
}

/** The host's connection, read once a second: it drives the link meter and the stats panel. */
function useHostStats(session: Session, hostId: string) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let sample: { bytes: number; at: number } | undefined;
    const tick = async () => {
      const peer = Object.values(session.room.getPeers()).find(
        (p) => p.userId === hostId && p.connection,
      );
      if (!peer?.connection) return;
      const read = await readStats(peer.connection, sample).catch(() => null);
      if (!read) return;
      sample = read.sample;
      setStats(read.stats);
    };
    void tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session, hostId]);
  return stats;
}

function StatsPanel({ stats }: { stats: Stats | null }) {
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 rounded-[10px] bg-black/60 px-3 py-2 font-mono text-sm tabular-nums backdrop-blur">
      {stats ? (
        <>
          <dt className="text-white/60">Picture</dt>
          <dd>
            {stats.width}×{stats.height} · {stats.fps} fps
          </dd>
          <dt className="text-white/60">Codec</dt>
          <dd>
            {stats.codec || "–"} · {formatRate(stats.kbps)}
          </dd>
          <dt className="text-white/60">Route</dt>
          <dd>
            {ROUTE_NAMES[stats.route]}
            {stats.rttMs !== null && ` · ${stats.rttMs} ms`}
          </dd>
        </>
      ) : (
        <dd className="col-span-2 text-white/60">Reading…</dd>
      )}
    </dl>
  );
}
