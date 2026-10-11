# Voice Notices for Revenge

A JavaScript plugin for Revenge on Android with the Vendetta-compatible plugin loader. It shows in-app notices when you or other members join or leave your current voice channel.

## Features

- Separate join, leave, and sound switches for yourself and other members.
- Individual user overrides using a Discord user ID; remove an override to use the group settings again.
- Persistent settings. Sounds are off by default.
- Moving between rooms counts as leaving the old room and joining the new one.
- Mute/deafen changes do not trigger notices. Existing occupants are not announced when you join.
- Disabling the plugin removes its listeners and releases its sound resources.

Version 1.2 intercepts Discord's original voice join, leave, move, disconnect, and reconnect sounds, including sounds cached before the plugin was enabled. The sound switches play Discord's bundled `user_join` and `user_leave` resources for the selected users through the voice audio route. Audio no longer needs to download from GitHub. Message, ringing, microphone, and other unrelated sounds remain unchanged. Settings affect only what you hear, not what other people hear. Notices are in-app toasts, not Android push notifications.

Open the plugin settings and check **Discord voice sound interception installed**. After someone joins or leaves, tap **Refresh sound status** to see the blocked-sound count. If only **Native fallback installed** appears, restart Discord with the plugin enabled: that fallback can identify sounds only when Discord prepares them. If neither interception API is available, enabling the plugin fails with an explicit error instead of claiming that Discord sounds are muted.

## Build and test

Requires Node.js 20 or newer.

```sh
npm ci
npm run build
npm test
```

The build produces `dist/manifest.json` and `dist/index.js`. Keep both files together. Legacy WAV files on the installation branch are retained for older cached plugin versions; version 1.2 does not use them.

## Install

1. Copy the install URL: **https://raw.githubusercontent.com/tengwitx/revenge-voice-notices/plugin/**.
2. In Revenge, open Settings → Plugins → Add and paste that folder URL, ending in `/`.
3. Enable **Voice Notices**, open its settings, and configure **Yourself** and **Other members**.
4. For an individual override, enable Discord Developer Mode, copy the person's user ID, paste it under **Individual user overrides**, and tap **Add user**.
5. Enable **Play notification sound** for the relevant group or individual if wanted. Both join and leave switches also control their associated sounds.

### Updating from an earlier version

Refresh/update Voice Notices in Revenge, then restart Discord. Check that the plugin version is **1.2.0**. Enable **Play notification sound** under the desired group or individual override; **Notify on join** and **Notify on leave** must also be enabled for the corresponding events. Use **Test join sound** and **Test leave sound** while connected to a voice channel to check your call volume. Test buttons play even if notification preferences are muted. Leave the sound switch off to silence that group's notices. If Revenge keeps the old bundle, remove and reinstall the same install URL; this can reset saved plugin settings.

Source repository: [tengwitx/revenge-voice-notices](https://github.com/tengwitx/revenge-voice-notices).

The `main` branch contains the source. The `plugin` branch contains the tested installation files. The `dist/` folder is generated locally and is not committed to `main`.

GitHub Actions could not run because GitHub reported an account billing lock. This install URL serves the published files directly and does not depend on Actions or GitHub Pages. Source changes do not publish automatically: build and test, then update the manifest and bundle on the `plugin` branch to release an update.

## Compatibility and checks

This targets the Vendetta compatibility API present in [Revenge's bundle](https://github.com/revenge-mod/revenge-bundle), not the separate Revenge Next ZIP plugin format. Interception follows Discord's reconstructed [MobileAudioSound implementation](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/sound_playback/native/SoundUtils.tsx) and [Android sound bridge](https://github.com/Wumpus-Central/midroid/blob/main/src/com/discord/sounds/SoundManagerModule.kt). It patches playback on the shared sound prototype, so previously cached instances are covered, and tracks native preparation as a fallback. Required store methods are checked at startup; missing replacement-sound support leaves text notices available. Updates to Discord can change these internal APIs.

Automated tests cover room transitions, mute/deafen, duplicate events, initial state, rule overrides, mocked plugin lifecycle, reconnects, unavailable audio, sound cleanup, and bundle hashes. Sound regression tests use the same `spitroast` patcher version as Revenge to verify cached-sound suppression, preserved unrelated sounds, per-user replacement audio, native fallback, and restoration after unload. They also cover toggling sound off/on/off, voice audio routing, success callbacks without metadata, and the sound test buttons. A real Android installation has not been tested here.

Before relying on it, test on your phone: join a room, have another member join/leave, toggle sounds, add their override, move rooms, reconnect, then disable the plugin and confirm its notices stop.
