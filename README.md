<p align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="assets/banner.png">
    <img src="assets/banner.webp" alt="Sightline: show your screen with a link" width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://sightline.luannzin.com"><b>Open Sightline</b></a> ·
  <a href="#sound">Sound</a> ·
  <a href="#when-it-doesnt-connect">When it doesn't connect</a> ·
  <a href="#run-it-yourself">Run it yourself</a>
</p>

Discord stopped letting me share my screen from the app, and the way around it everybody uses is
opening a Google Meet. A whole meeting, with a lobby and a camera prompt, for "hey, look at this".

Sightline is only the part I wanted. You share your screen and get a link. Whoever opens it watches,
live, in the browser, with sound. Nobody installs anything, nobody makes an account, and the video
goes straight from your browser to theirs, the same way Deskline and PartyLine connect on the
desktop. There's no server of mine in the middle, because there's no server of mine at all: the
site is a static page.

<p align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/demo.png">
    <img src="docs/demo.webp" alt="Sharing on the left, watching on the right. Share your screen turns the page live with a link, a second browser opens the link and connects, and the shared tab plays there under the sharer's name and critter while the first page goes to 1 watching" width="100%">
  </picture>
  <br>
  <sub>sightline.luannzin.com sharing a tab to a second browser, recorded as it ran.</sub>
</p>

## Use it

1. Open Sightline and click **Share your screen**.
2. Pick a screen, a window or a tab in the browser's picker. To send sound, turn on the audio
   option there.
3. Copy the link (Sightline copies it for you when the browser allows) and paste it wherever:
   Discord, WhatsApp, an email.
4. They open it and they're watching. There's nothing to fill in first.

Everyone gets a made-up name and a pixel critter the first time ("Amber Moth" and a little
dithered creature), so nobody has to type anything to watch. Click yours (in the corner of the
page, or on the stage while watching) to change either, any time, even mid-share: everyone sees
the change at once, and the browser keeps it for next time.

Browsers won't play sound on a page nobody has clicked yet, so the picture starts muted with a
**Turn on sound** button; any click or key brings the sound in.

While you share, the page tells you when someone comes in and shows who's watching and how each
connection is doing: the same link meter Deskline draws (dusk dots that reach further and warm up
the better the link is), and in words, same network, direct or through a relay, the bitrate and
the round trip. If your connection drops without you stopping, viewers keep the last picture and
wait up to a minute for you to come back. From there you can:

- Switch **Best for** between **Text** and **Motion**. Text keeps every pixel sharp and lets the
  frame rate drop, for code and documents. Motion keeps 60 frames per second and lets resolution
  give, for video and games.
- **Change source** to another screen, window or tab. The link stays the same.
- **Add a sound source**: a mic, or your desktop sound on Linux (below).
- **Remove** someone. They're disconnected, and the same link won't let them back in from that
  browser. A private window gets around it, so for someone who really shouldn't watch, stop and
  share again: the new link is a new room.
- **Stop sharing**, or use the browser's own stop button. Both end it for everyone.

<p align="center">
  <img src="docs/sharing.png" alt="Sightline while sharing: the preview with Live and 1 watching, Change source and Stop sharing, the link with Copy link, Best for Text or Motion, Sound, and who's watching with their critter, the link meter, the route, bitrate and round trip" width="440">
</p>

The person watching gets the screen edge to edge: double-click or **F** for full screen, **M** to
mute, **I** for the numbers (resolution, frame rate, codec, bitrate, route), and picture in
picture where the browser has it.

<p align="center">
  <img src="docs/viewer.png" alt="Watching a share in the browser: the sharer's critter and name, Live and the link meter on top, your own critter in the corner, the volume, picture in picture and full screen at the bottom, and the numbers: resolution, frame rate, codec, bitrate and route" width="100%">
</p>

The link works while your tab is open. Close it and the share is over, and the next share gets a
new link.

## Sound

Browsers decide what sound a web page can capture, and they don't agree:

| Sharing from | Sound |
|---|---|
| Chrome or Edge on Windows | Whole screen, a window or a tab |
| Chrome or Edge on macOS | A tab anywhere; the whole screen on macOS 14.2 or later |
| Chrome on Linux | A tab only. For everything else, see below |
| Firefox, Safari | None. They capture no sound at all |

Phones and tablets can watch but can't share: their browsers don't let a page capture the screen.

### Sound on Linux

Chrome on Linux only captures sound when you share a tab. Share the whole screen and it's silent.
The way around it is turning your desktop sound into an input, which Sightline can send like a mic.
With PipeWire or PulseAudio:

```bash
pactl load-module module-remap-source \
  master="$(pactl get-default-sink).monitor" \
  source_name=desktop-sound source_properties=device.description=Desktop-sound
```

Then, while sharing, click **Add a sound source**, allow it, and pick **Desktop-sound** in the list.
It lasts until you log out; `pactl unload-module module-remap-source` removes it sooner. Nothing
loops back, because the people watching never send sound to you.

Chrome also has a flag, `--enable-features=PulseaudioLoopbackForScreenShare`, that's meant to put
system sound in the picker itself. It's off by default and I haven't tried it.

### Sound while you're in a call

Sharing a whole screen with sound sends everything your computer plays, from every screen at once,
including the people talking in Discord or any other call. If they're watching too, they hear
themselves back. To send only what you mean to:

- **Share a tab.** A tab sends only its own sound.
- **Share one window.** Chrome 141 and later can offer that window's own sound in the picker,
  where your system supports it.
- **Route one app into a virtual cable (Windows).** Install
  [VB-CABLE](https://vb-audio.com/Cable/), then in **Settings › System › Sound › Volume mixer**
  set the app's output to **CABLE Input**. Share your screen with the audio option off, click
  **Add a sound source** and pick **CABLE Output**. To keep hearing the app yourself, turn on
  **Listen to this device** for CABLE Output in the classic Sound control panel.
- **On Linux**, the same idea with a null sink: route the app to it and add its monitor as the
  sound source, as in [Sound on Linux](#sound-on-linux).

## When it doesn't connect

Two browsers connect directly with help from public STUN servers, and that works for most home and
office networks. Some networks don't allow it: mobile carriers that put many phones behind one
address, strict corporate firewalls. Then the page says it can't reach the host directly.

The fix is a TURN relay, which passes the video along when there's no direct path. Set one in
**Network settings** at the bottom of the page: your own [coturn](https://github.com/coturn/coturn),
or a hosted one like Cloudflare's. The video stays encrypted end to end, so the relay carries it
without being able to watch it. Sightline doesn't come with one, because a shared relay is exactly
the server in the middle this was supposed to avoid.

## Privacy

- The link is `#<secret>~<host id>`. Everything after the `#` stays in the browser; it's never
  sent to the site hosting the page.
- Before two browsers can connect they swap connection details through public Nostr relays.
  Those details are encrypted with a key derived from the secret, and the room is named by a hash
  of it, so the relays see neither. They do see that two IP addresses met.
- Once connected, the video and sound go browser to browser over WebRTC, encrypted (DTLS-SRTP).
  The two of you can see each other's IP address, as in any peer-to-peer call.
- The host id in the link comes from a key made fresh for each share. Viewers only accept a stream
  from that key, so someone else holding the link can't pretend to be you, and two of your shares
  can't be tied together by it.
- Anyone with the link can watch until you stop. Treat it like the screen itself.

## Run it yourself

It's a static site, so it runs anywhere that serves files over HTTPS (browsers only allow screen
capture on HTTPS or localhost).

```bash
bun install
bun run dev        # http://localhost:5173
bun run test       # the SDP rewrite, codec choice, links, critters, profiles
bun run e2e        # a real host and viewer in headless Chromium (needs the internet and
                   # `bunx playwright-core install chromium` once, or CHROMIUM_PATH)
bun run build      # dist/
```

**Vercel**: import the repository; it detects Vite (build `bun run build`, output `dist`). Link
previews take the production address from Vercel on their own.

**Anything else**: build command `bun run build`, output `dist`. Set `VITE_SITE_URL` to the address
it's served at (no trailing slash) so link previews find their image; `.env` has the default.

`tools/logo.py` draws the pixel-art mark, the icons, the link preview image and the banner
(`python3 tools/logo.py`, needs Pillow).

## How it works

- `src/lib/room.ts`: [Trystero](https://github.com/dmotz/trystero) rooms over Nostr. The host owns
  the room (Trystero's `roles` plugin makes its key the admin), publishes its name, critter and
  whether it's live, and can ban. Viewers publish their name and critter, checked on arrival.
- `src/lib/profile.ts`, `src/lib/avatar.ts`: the made-up names, and the critters, drawn from one
  32-bit seed (a mirrored body, eyes, the dusk in a Bayer dither, an outline), so the seed is all
  that travels and every browser draws the same one.
- `src/lib/share.ts`: the host's side. One `MediaStream` holds the screen's video, its sound and the
  extra sound source; changing any of them syncs only the difference to everyone watching.
- `src/lib/peer.ts`: every WebRTC decision, in one `RTCPeerConnection` subclass handed to Trystero.
  It asks for stereo Opus at 128 kbps (browsers negotiate mono speech by default), caps each
  viewer's bitrate and frame rate by mode, and picks the codec: AV1, VP9 or H.264 when this machine
  encodes it in hardware, else VP9.
- `src/lib/capture.ts`: the picker, with sound processing off so music and games arrive as they
  are, and the focus kept on Sightline instead of jumping to what you shared.
- `src/lib/link.ts`: the secret and the link.
- `src/lib/stats.ts`: the numbers, from `getStats()`, and the link's quality from its route and
  round trip (Deskline's measure). `src/components/link.tsx` draws it as Deskline's link meter,
  and the sweep while connecting.
- `src/screens/`: the host page and the viewer's stage. The UI is [coss ui](https://coss.com/ui)
  on Tailwind, and the dithered sky behind it comes from luannzin.com's footer.

## Known limits

- Your browser encodes the video once per viewer, so CPU and upload grow with every person
  watching. The caps are 6 Mbps per viewer for Text and 8 for Motion; a handful of people is the
  comfortable range.
- Choosing the codec needs a recent Chrome or Edge. Other browsers send their default.
- Not measured yet: the delay from your screen to theirs, and how often a connection needs a relay.
