# Voice Notices for Revenge

A single-switch plugin for Revenge on Android:

- **Plugin enabled:** mute Discord's voice join, leave, move, disconnect, and reconnect sounds for yourself and other members.
- **Plugin disabled:** remove the interception and let Discord play its original sounds normally.

There is no settings page, user list, text notification, replacement audio, audio download, or voice-state subscription. Previous versions' saved preferences are ignored. Message, ringing, microphone, and stream sounds keep their normal behavior. The plugin changes only what you hear.

## Install or update

Install URL: **https://raw.githubusercontent.com/tengwitx/revenge-voice-notices/plugin/**

1. In Revenge, open **Settings → Plugins → Add** and paste the install URL, or update the existing **Voice Notices** plugin.
2. Check that its version is **2.0.1**. Restart Discord once after updating from an older version to unload the previous code, including any muting instance left behind by version 2.0.0.
3. Use the plugin's own enable switch. Turn it on for silence or off for Discord's normal voice sounds. Subsequent toggles do not require a restart.

Normal playback still follows Discord's own sound and device-volume settings. Disabling this plugin does not force sounds that Discord itself has disabled.

## Build and test

Requires Node.js 20 or newer.

```sh
npm ci
npm run build
npm test
```

The build produces `dist/manifest.json` and `dist/index.js`. Source is on `main`; published installation files are on `plugin`. Build and test before updating those two files on `plugin`. Legacy WAV files remain available for older cached releases; version 2 does not use them.

Source repository: [tengwitx/revenge-voice-notices](https://github.com/tengwitx/revenge-voice-notices).

## Compatibility and verification

The plugin uses Revenge's Vendetta compatibility API and Discord's [MobileAudioSound](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/sound_playback/native/SoundUtils.tsx) playback prototype. Patching this shared prototype covers sound instances cached before enabling. Disabling restores the original methods without changing audio volumes, preparing sounds, or releasing Discord's resources.

If the required playback API is missing, enabling fails explicitly instead of installing the old native fallback that could miss cached sounds. Discord updates can change this internal API.

Only one muting instance can own the shared playback prototype. Starting a new instance deactivates the old one before installing its hooks. Disabling deactivates callbacks before removing hooks, so a retained callback cannot keep muting if cleanup fails. Cleanup attempts every hook even if one removal throws, and logs the error.

The overlapping-start failure is reachable in Revenge's [plugin manager](https://github.com/revenge-mod/revenge-bundle/blob/main/src/core/vendetta/plugins.ts): `startPlugin` awaits plugin evaluation, then overwrites its single instance entry without stopping a preceding instance. The [plugin switch model](https://github.com/revenge-mod/revenge-bundle/blob/main/src/core/ui/settings/pages/Plugins/models/vendetta.ts) does not wait for the start to finish or prevent another start. Tests mirror two concurrent async starts followed by a single stop.

Tests use Revenge's `spitroast` patcher and the actual generated bundle. They exercise cached sounds, asynchronous native playback, repeated toggles, overlapping plugin starts, late cleanup from older instances, retained callbacks, failed hook removal, completion callbacks, unrelated sounds, partial setup failure, and coexistence with another patch. The overlapping-start regression reproduced continued muting after disable on version 2.0.0 before the fix. This proves a failure path, not that it is the exact trigger on every affected device. A real Android device has not been tested here.
