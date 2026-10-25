# Horizon desktop

Desktop terminal and system observatory for macOS and Windows. Current release: **0.3.2** (unsigned development build).

Features include local and SSH terminals, equal-size terminal splits, SFTP, serial consoles, known-host verification, optional session logs, live system telemetry, and an animated filename observatory.

Milky Way image: **[ESO/S. Brunier](https://www.eso.org/public/images/360-cm-la-silla-cc/)**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [artwork attribution](THIRD_PARTY_NOTICES.md).

An installed Electron application using TypeScript, React, Node.js, xterm.js, and a native PTY. Tailwind CSS is compiled into the application. No Python application code. All assets run locally, without a web server or hosted page.

## Run and package

```sh
npm ci
npm run build
npm start
npm test
npm run dist:mac
```

On Windows, use `npm run dist:win` to build the NSIS `.exe` installer. The included manual GitHub Actions workflow builds each installer on its native OS when this project is placed at the repository root. The initial Windows x64 installer was cross-packaged on macOS with the supplied Windows node-pty prebuilds; Windows has not yet been exercised on a Windows machine. macOS release signing/notarization and Windows signing require the owner's certificates; local unsigned packages are development builds.

If macOS has conflicting Command Line Tools and Xcode SDK versions, choose the matching installed SDK for native compilation, for example:

```sh
SDKROOT=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX26.5.sdk npm run postinstall
```

## What is implemented

- Real local shell sessions in tabs, with interactive CLI support via node-pty and xterm.js.
- Explorer refreshed every two seconds; zsh, bash and PowerShell report their current directory through shell integration. Directory clicks issue a quoted `cd`/`Set-Location` command.
- CPU, active memory, network throughput and filesystem capacity sampled from systeminformation once per second. Charts use timestamped measurements, never procedural waveforms. Network is aggregated across non-loopback interfaces; this can include overlapping physical/VPN traffic.
- White storage squares with a subtle green halo. The square grid fills the available panel area and reports capacity per square; the final occupied square's opacity shows fractional occupancy. This is capacity allocation, not physical sectors or per-file heat.
- A rotating filename disk using real indexed paths. Local scanning skips inaccessible directories and symlinks, excludes virtual filesystems and duplicate macOS volume paths, and stops after about 500,000 files; a reservoir sample of up to 1,200 filenames is rendered. External volumes are not indexed in this first implementation. The scan is shared across tabs, streamed with bounded traversal depth, throttled in batches, and limited to 120 seconds or 25,000 directories. A completed sample is cached for one hour. The scan status explicitly reports limits and skipped directories. The shared index is reused by new sessions, not yet maintained by device-wide file watchers.
- Saved SSH profiles, passwords encrypted with Electron safeStorage, SSH private-key selection, first-use host fingerprint verification, and strict matching thereafter.
- Remote shell and SFTP browsing/upload/download. Transfer dialogs confirm local destinations and remote overwrites. Remote monitoring reads Linux `/proc` and `df`; unsupported/denied readings display unavailable. CPU and traffic rates are derived from counter deltas.

## Current limits

This is the first working desktop build, not complete Termius parity. SSH/SFTP has not been tested against the user's server. Encrypted private-key passphrases, SSH agent integration, Mosh, forwarding, reconnection, and advanced credential management are not implemented. Connections opened through saved hosts install session-only Bash, Zsh or Fish prompt hooks so Explorer follows typed directory changes. Nested SSH commands typed inside an existing shell are not separate app-managed connections. Remote filename visualization samples accessible server paths over SFTP, capped at 1,200 files, 200 directories and approximately 15 seconds; it is a snapshot, not a complete filesystem census. The sample math, decorative agent list, and simulated readings from the web concept have been removed.

The published Sites page remains a design preview; it cannot read local operating-system telemetry. This application does not embed or load that page.

## Performance update 0.1.1

Filename textures are drawn off-thread in a worker, transferred with explicit bitmap disposal, and rotated by the compositor. The wireframe uses a small, bounded canvas and pauses while hidden. Index snapshots are sent at most every 15 seconds while scanning. Filesystem capacity is sampled every 30 seconds; CPU, system memory, and network remain one-second measurements. Network is a single chart: solid download and dashed upload on the same scale. System Memory is machine-wide; Horizon RSS is the sum of Electron-process resident sets (shared pages may be counted in more than one process; shell subprocesses are not included).

Explorer uses a fixed eight-stat pool, caches unchanged folders for ten seconds, and renders only visible rows. Listings are limited to the first 2,000 directory entries and explicitly labelled when capped. Terminal output is batched with acknowledgement-based backpressure and 2,000 lines of scrollback. Closed-tab history is released.

## Connection update 0.1.2

The plus button opens a saved-host picker with a local terminal (PowerShell on Windows) option. Switching sessions resets the filename canvas and uses that session's own index. Remote prompt directory updates trigger immediate Explorer refresh; stale asynchronous directory results are discarded. Storage adapts its square count to the panel dimensions, retaining white centers and green halos.

## Background and editing update 0.1.3

Telemetry samples every connected tab, including while the window is minimized. Local tabs share one operating-system sample; each remote session has an independent in-flight guard and an eight-second request deadline. The charts retain their existing rolling 60-second history. Remote disconnections still produce genuine gaps; data is not invented while a server is unreachable.

Explorer refreshes are isolated per session. Remote SFTP listings time out after five seconds, so a stalled server cannot block local directory synchronization. Last available remote listings remain visible with an unavailable notice. Local shell hooks encode literal percent signs and control characters correctly and do not depend on network access.

The bottom panel proportions are 20/40/20/20. A stationary, glowing filename and leader line identify an editor-launched file above the moving ring. Bash/Zsh wrappers support `nano`, `vi`, `vim`, `nvim`, and `emacs`, preserve command arguments and exit status, and clear the callout when the command finishes. Existing custom shell functions are left intact. The callout tracks the first file argument at launch; in-editor buffer switches, absolute editor executable paths, `sudo editor`, and unrelated GUI applications require further integration. PowerShell's `notepad file` launch reports the file and child process; Windows/modern Notepad process handoff has not been verified on a Windows machine. Fish currently reports directories, not editor files.

Validation: `npm test` exercises directory/editor hooks in real Bash and Zsh PTYs, including percent signs, argument/exit-code preservation, timeout cleanup, and isolation between stalled remote jobs and local jobs. `HORIZON_REGRESSION=1 npm start` runs a Mac desktop regression using temporary fixture files, multiple tabs, minimized sampling, actual Nano, and panel-width assertions. It writes results into `release/`.

## Ring extraction and quiet SSH setup 0.1.4

The ring worker reports each rendered filename's polar coordinates. When editing starts, Horizon reads the ring's current CSS rotation, lifts the individual curved letters from that position, straightens and enlarges them over 1.5 seconds, and leaves the glowing filename stationary above the rotating disk. The selected entry is omitted from the rotating texture while editing. A leader line reveals the outside callout with the full path, extension, filesystem size and modification time. Files outside the bounded visualization sample are inserted into the ring before extraction. Reduced-motion mode skips the movement.

Supported SSH shells now start with a private connection-time script uploaded over SFTP into a randomly named mode-0700 temporary directory, with mode-0600 script files. Bash/Zsh/Fish load the integration during shell startup, so setup commands are never typed or echoed in the terminal. Scripts remove themselves after loading; user dotfiles are not modified. Remote telemetry already runs on separate SSH exec channels. This requires a writable `/tmp` and SFTP access; setup failures are reported. Tests use real Bash/Zsh PTYs and a simulated SFTP transport; the user's remote server and Windows remain unverified.

## Frozen track selection 0.1.5

Selection now magnifies a filename in place on its original circular track. The word center, track radius and rotation angle at selection are frozen; letters remain curved, expand symmetrically around that anchor, become bold and glow. The pointer starts at that same frozen anchor. Other filenames continue rotating. Closing the editor restores the filename to the rotating layer.

Every full path has a deterministic track number and angular address independent of ordering or selection. Current-directory files are included before editing, alongside the device sample. A path outside the current visible set is rendered at its predetermined address, not inserted into the first track or used to repack neighboring filenames. The display remains capped at 1,200 filenames; it is not a simultaneous rendering of every file on the device. Different paths may have overlapping positions at this scale. The bounded scan limits and inaccessible-directory restrictions still apply.

## Readable, paused file focus 0.1.6

Filename placement now reserves non-overlapping arc intervals instead of independently hashing angles. Existing visible paths retain their allocated positions; new paths use available gaps. The display uses 36 tracks with 16-unit radial spacing, 11-unit bold type (previously 7.7–9), and tighter 0.60-em ASCII advance (previously 0.64). Wide Unicode characters receive wider advances. Names that cannot fit are omitted rather than stacked; the active file receives priority. The 1,200-path index bound is unchanged, but the number of rendered labels depends on filename lengths.

Opening a detected editor file pauses the entire circle, including its core. The selected curved name grows by exactly four CSS pixels and glows at its existing location. Labels intersecting its enlarged footprint are temporarily hidden to keep the highlight readable. Exiting the editor restores normal rotation unless the user manually paused it. The pointer and file details remain attached. Regression tests verify paused ring transforms, +4-pixel growth, and automatic resumption; layout tests cover dense, long, and Unicode names.

If the selected track location falls outside the cropped observatory viewport, the ring and core are panned together just enough to expose the highlight; the filename's position relative to its track is unchanged. The view returns when editing ends.

## Counter-rotating dial focus 0.1.7

New filenames choose randomized available arc gaps, preserving collision reservations and existing slots. Every track starts at a different seeded phase, with alternating clockwise/counterclockwise motion and modest speed variation. One shared worker-built texture is composited through annular masks at up to 25 fps; textures are released on replacement and unmount, and rendering stops while hidden or settled. This avoids a full-size texture per track.

The wheel stays centered at all times. Starting a supported editor pauses individual track motion, turns the whole wheel by the shortest arc to place the word center at 2 o'clock, then applies the existing +4 CSS-pixel bold/glow focus and leader line. Reduced-motion mode skips the dial. Ending the edit resumes the separate track motions unless manually paused. The selected label retains its original track radius and location relative to the wheel; there is no viewport panning. The center now uses the Horizon wireframe rhombus and displays the local hostname or remote hostname obtained through the existing background SSH probe (falling back to the configured address).

## Compact core and host titles 0.1.8

The central opening is reduced from a 195-unit rim to 135 units. The first filename track moves inward to 150 units, with 18-unit radial spacing preserving legibility and the overall disk diameter. A larger uppercase display title fits beneath the animated Horizon rhombus. Local sessions use Local Terminal/Local PowerShell; remote sessions show the saved host's display name, not its operating-system hostname. Hosts → Rename changes only that saved title, persists it, and updates connected tabs and their center titles immediately. Connection edits also refresh open-session titles. Renaming preserves connection addresses, credentials and host trust.

Track directions are independently seeded rather than alternating. A small set of tilted SVG ellipses with moving highlights adds a restrained Saturn-ring backdrop without particle buffers or per-track textures. Its motion respects Pause and reduced-motion preferences. The UI pass increases panel headings, explorer and telemetry text, improves saved-host controls, and makes the file-detail callout scrollable for long paths. The core remains centered, and the two-o'clock dial plus four-pixel focus behavior is retained.

## Neighbor-safe highlight and network identity 0.1.9

Highlighting replaces only the active filename with its enlarged overlay. Adjacent track labels are no longer suppressed, and the overlay no longer paints a black text outline over them. The existing centered dial, pause and four-pixel enlargement remain. A static, locally bundled Milky-Way-inspired star/dust SVG sits behind the circle at low opacity; no additional animation loop, external image request or large particle buffer is required.

A scrollable network identity panel below the device index follows the active session and uses the same 25-pixel bold monospace values as the file count. It shows the saved machine title, interface selector, local IPv4/IPv6, public egress IP, DNS resolver addresses, MAC address and default gateway. Local data comes from OS interfaces, the Node resolver configuration and systeminformation. SSH data is collected on a separate exec channel on the remote machine using Linux iproute2, resolv.conf/resolvectl, and curl. Unsupported hosts or missing tools show unavailable fields; they never substitute the local machine's data. Public IP lookup contacts api64.ipify.org from the machine being inspected and may report a shared NAT/VPN egress or IPv6 address. Local public-IP results are cached up to five minutes; snapshots refresh every 30 seconds with in-flight guards and deadlines. Windows and a real remote SSH server still require runtime verification.

## Stable machine ring and neighbor push 0.2.0

The circle now uses the machine index directly, without replacing entries with every current directory listing. Local index publication runs independently of Explorer reads, so an inaccessible or slow directory cannot prevent circle initialization. Once the bounded sample fills, ongoing scanning updates the count without randomly replacing displayed paths; identical index messages reuse the renderer's existing array and avoid unnecessary texture rebuilds. An opened file outside the sample is still inserted for focus. The 1,200-path rendering bound remains.

On focus, the selected track transfers atomically into the overlay. Its other labels animate along their original radius as the selected filename expands, distributing the required space through the available gaps on both sides. Every transferred neighbor is drawn, and the original track is restored on exit. While focused, incoming index changes wait until focus ends. This avoids labels vanishing, doubled labels during the handoff, and texture changes mid-animation.

Network figures are reduced to 14px with lighter panel styling. The Milky Way background has a denser star field and brighter, layered dust clouds while remaining a static asset. Native ICNS/ICO artwork now uses the Horizon rhombus, including the Windows installer/uninstaller and the app window icon.

## Galaxy, known hosts, logs and serial 0.3.0

The supplied Milky Way photograph is bundled locally, with slow compositor-driven drift and a darkened center to preserve filename contrast. A textured, tilted ring of rocky particles rotates behind the filename disk. Both effects pause with the circle and respect reduced-motion preferences; there is no unbounded particle simulation.

Known Hosts lists Horizon's trusted SSH fingerprints per saved profile. Forgetting a key requires confirmation and makes the next connection request trust again; changed keys remain blocked. The operating system's known_hosts file is not modified.

Logs retains the latest 1,000 connection/activity events locally. Terminal-output recording is opt-in per session, off by default, and held in memory until exported. Each transcript retains at most two million characters, with at most 16 transcripts and a 50,000-character UI preview. Output can include echoed secrets. Export and clear controls are available in the Logs drawer.

New Tab and Saved Hosts now offer Serial Console, including port discovery/manual paths, baud rate, data bits, stop bits, parity and hardware/software flow control. Saved serial configurations persist locally. Serial supplies a real terminal byte stream; filesystem browsing and machine telemetry require a shell integration such as SSH and are explicitly unavailable for serial sessions. Open operations have deadlines and terminal output uses bounded backpressure.

Validation includes unit tests with a simulated serial device, late-open cleanup, host-key mismatch rejection, bounded logs, and a Mac desktop regression covering the new drawers, native port enumeration, recording, file focus and background telemetry. Physical serial hardware and Windows runtime behavior still require verification. Installers remain unsigned development builds.

## Equal-size terminal split 0.3.1

The terminal header's + button opens one independent terminal immediately above the original, preserving both panes' width and height. Local splits inherit the current working directory. SSH splits establish a separate connection to the same saved host and begin in its normal login directory. Serial ports cannot be duplicated. Clicking a pane directs Explorer, telemetry, logs and file focus to that session. Splits remain grouped under their original tab, survive tab switches, and keep collecting telemetry in the background. The upper pane's close button closes only that session; closing the tab closes both. The upper pane overlays part of the observatory, leaving the bottom four-panel layout unchanged.

## Sharper rendering and last login 0.3.2

Filename textures adapt to device pixel ratio, capped at 2,560 pixels per side, and cached glyphs render at triple resolution. The source photograph remains at its original resolution; removing the extra zoom and applying black-point contrast improves its presentation without claiming new photographic detail. The core, panels and dark background base remain pure black.

A compact readout immediately above Storage shows the active machine's latest available OS login record: account, recorded time, access location and source IP when recorded. Location means local console or remote terminal/source, not geographic geolocation. Mac/Linux use bounded `last` output; SSH reads it over a separate background channel. Windows uses the latest interactive/remote-interactive Security log event, subject to permissions. Missing records, source IPs and unsupported serial sessions are labelled unavailable, never replaced with current machine addresses. Results are cached for one minute. Windows and remote-server behavior remain runtime-unverified.
