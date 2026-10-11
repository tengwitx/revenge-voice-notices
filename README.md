# Voice Notices for Revenge

A JavaScript plugin for Revenge on Android with the Vendetta-compatible plugin loader. It shows in-app notices when you or other members join or leave your current voice channel.

## Features

- Separate join, leave, and sound switches for yourself and other members.
- Individual user overrides using a Discord user ID; remove an override to use the group settings again.
- Persistent settings. Sounds are off by default.
- Moving between rooms counts as leaving the old room and joining the new one.
- Mute/deafen changes do not trigger notices. Existing occupants are not announced when you join.
- Disabling the plugin removes its listeners and releases its sound resources.

Sound switches control **this plugin's notification sounds only**. They do not mute Discord's built-in sounds or change what other people hear. Notices are in-app toasts, not Android push notifications. This plugin does not monitor other rooms while you are disconnected or announce rooms you cannot see.

## Build and test

Requires Node.js 20 or newer.

```sh
npm ci
npm run build
npm test
```

The build produces `dist/manifest.json`, `dist/index.js`, `dist/join.wav`, and `dist/leave.wav`. Keep all four files together.

## Install

1. Copy the install URL: **https://tengwitx.github.io/revenge-voice-notices/**.
2. In Revenge, open Settings → Plugins → Add and paste that folder URL, ending in `/`.
3. Enable **Voice Notices**, open its settings, and configure **Yourself** and **Other members**.
4. For an individual override, enable Discord Developer Mode, copy the person's user ID, paste it under **Individual user overrides**, and tap **Add user**.
5. Enable **Play notification sound** for the relevant group or individual if wanted. Both join and leave switches also control their associated sounds.

Source repository: [tengwitx/revenge-voice-notices](https://github.com/tengwitx/revenge-voice-notices).

Every push to `main` builds and tests the plugin, then publishes the four output files to GitHub Pages. Publishing runs only if the tests pass. The `dist/` folder is generated automatically and is not committed.

## Compatibility and checks

This targets the Vendetta compatibility API present in [Revenge's bundle](https://github.com/revenge-mod/revenge-bundle), not the separate Revenge Next ZIP plugin format. Sound playback uses Discord's internal `DCDSoundManager` interface, also demonstrated by [Soundbanks](https://github.com/Angelix1/VP/tree/main/plugins/soundbanks). Required store methods are checked at startup; missing sound support leaves text notices available. Updates to Discord can change these internal APIs.

Automated tests cover room transitions, mute/deafen, duplicate events, initial state, rule overrides, mocked plugin lifecycle, reconnects, unavailable audio, sound cleanup, bundle hashes, and WAV headers. A real Android installation has not been tested here.

Before relying on it, test on your phone: join a room, have another member join/leave, toggle sounds, add their override, move rooms, reconnect, then disable the plugin and confirm its notices stop.
