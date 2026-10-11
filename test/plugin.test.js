import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createHash } from "node:crypto";
import patcher from "spitroast";

const source = await readFile("dist/index.js", "utf8");
const methods = ["play", "loop", "playWithListener"];

function harness({ missingPlayer = false, failPatchAt = 0, failUnpatchAt = 0, retainCallbacks = false } = {}) {
    const prepared = [], played = [];
    let nextKey = 0;
    const resources = new Map();
    const native = {
        prepare(name, key) { prepared.push(name); resources.set(key, name); },
        play(key) { played.push(resources.get(key)); }
    };
    class MobileAudioSound {
        constructor(name) { this.name = name; this.volume = 0.35; }
        ensureSound() {
            if (!this.soundPromise) {
                const key = ++nextKey;
                native.prepare(this.name, key);
                this.soundPromise = Promise.resolve({ play: () => native.play(key), volume: this.volume });
            }
            return this.soundPromise;
        }
        play() { this.ensureSound().then(sound => sound.play()); }
        loop() { this.ensureSound().then(sound => { sound.numberOfLoops = -1; sound.play(); }); }
        playWithListener() { return this.ensureSound().then(sound => { sound.play(); return true; }); }
    }
    const originals = Object.fromEntries(methods.map(method => [method, MobileAudioSound.prototype[method]]));
    let patches = 0;
    let cleanupAttempts = 0;
    const warnings = [];
    const retainedCleanup = [];
    const api = {
        metro: {
            findByProps(name) {
                assert.equal(name, "MobileAudioSound");
                return missingPlayer ? undefined : { MobileAudioSound };
            }
        },
        patcher: {
            instead(...args) {
                if (++patches === failPatchAt) throw new Error("Patch installation failed");
                const undo = patcher.instead(...args);
                retainedCleanup.push(undo);
                return () => {
                    if (++cleanupAttempts === failUnpatchAt) throw new Error("Patch removal failed");
                    if (!retainCallbacks) return undo();
                };
            }
        },
        logger: { warn: (...args) => warnings.push(args) }
    };
    const evaluate = () => vm.runInNewContext(source, { vendetta: api });
    return {
        plugin: evaluate(), evaluate, api, MobileAudioSound, originals, prepared, played, warnings,
        get cleanupAttempts() { return cleanupAttempts; },
        removeRetained() { retainedCleanup.forEach(undo => undo()); },
        flush: () => new Promise(resolve => setImmediate(resolve)),
        assertRestored() {
            for (const method of methods) assert.equal(MobileAudioSound.prototype[method], originals[method]);
        }
    };
}

test("plugin exposes only enable/disable and requires no UI, storage, or voice stores", () => {
    const h = harness();
    assert.deepEqual(Object.keys(h.plugin).sort(), ["onLoad", "onUnload"]);
    h.plugin.onLoad();
    assert.equal(h.prepared.length, 0);
    assert.equal(h.played.length, 0);
    h.plugin.onUnload();
    h.assertRestored();
});

test("enabled plugin blocks cached and new voice sounds on every playback path", async () => {
    const h = harness();
    const cached = new h.MobileAudioSound("user_join");
    const cachedResource = await cached.ensureSound();
    h.plugin.onLoad();
    cached.play();
    for (const name of ["user_join", "user_leave", "user_moved", "disconnect", "reconnect", "halloween_user_join", "winter_user_leave"]) {
        const audio = new h.MobileAudioSound(name);
        audio.play();
        audio.loop();
        assert.equal(await audio.playWithListener(), true);
        assert.equal(audio.soundPromise, undefined);
    }
    await h.flush();
    assert.deepEqual(h.played, []);
    assert.deepEqual(h.prepared, ["user_join"]);
    assert.equal(await cached.ensureSound(), cachedResource);
    assert.equal(cached.volume, 0.35);
    h.plugin.onUnload();
    h.assertRestored();
});

test("disabling restores cached sound playback immediately without reloading audio", async () => {
    const h = harness();
    const audio = new h.MobileAudioSound("user_leave");
    const resource = await audio.ensureSound();
    h.plugin.onLoad();
    audio.play();
    await h.flush();
    assert.equal(h.played.length, 0);
    h.plugin.onUnload();
    h.assertRestored();
    for (const method of methods) await audio[method]();
    await h.flush();
    assert.deepEqual(h.played, ["user_leave", "user_leave", "user_leave"]);
    assert.deepEqual(h.prepared, ["user_leave"]);
    assert.equal(await audio.ensureSound(), resource);
    assert.equal(resource.volume, 0.35);
});

test("repeated on/off cycles keep restoring original sounds with no stacked patches", async () => {
    const h = harness();
    const audio = new h.MobileAudioSound("user_join");
    await audio.ensureSound();
    for (let cycle = 0; cycle < 10; cycle++) {
        h.plugin.onLoad();
        h.plugin.onLoad();
        audio.play();
        await h.flush();
        assert.equal(h.played.length, cycle);
        h.plugin.onUnload();
        h.plugin.onUnload();
        h.assertRestored();
        audio.play();
        await h.flush();
        assert.equal(h.played.length, cycle + 1);
    }
    assert.equal(h.prepared.length, 1);
});

test("Revenge-style fresh plugin evaluation on each enable preserves cached instances", async () => {
    const h = harness();
    const cached = new h.MobileAudioSound("disconnect");
    await cached.ensureSound();
    for (let cycle = 0; cycle < 5; cycle++) {
        const plugin = h.evaluate();
        plugin.onLoad();
        cached.play();
        await h.flush();
        assert.equal(h.played.length, cycle);
        plugin.onUnload();
        h.assertRestored();
        cached.play();
        await h.flush();
        assert.equal(h.played.length, cycle + 1);
    }
});

test("overlapping plugin starts do not leave an earlier muting instance behind", async () => {
    const h = harness();
    const first = h.evaluate();
    const second = h.evaluate();
    try {
        first.onLoad();
        second.onLoad();
        second.onUnload();
        new h.MobileAudioSound("user_join").play();
        await h.flush();
        assert.deepEqual(h.played, ["user_join"]);
        h.assertRestored();
    } finally {
        first.onUnload();
        second.onUnload();
    }
});

test("concurrent Revenge-style async starts followed by one stop restore sound", async () => {
    const h = harness();
    const pendingStorage = [];
    let current;
    let enabled = false;
    async function start() {
        await new Promise(resolve => pendingStorage.push(resolve));
        current = h.evaluate();
        current.onLoad();
        enabled = true;
    }
    const first = start();
    const second = start();
    assert.equal(enabled, false);
    pendingStorage.forEach(resolve => resolve());
    await Promise.all([first, second]);
    new h.MobileAudioSound("user_join").play();
    await h.flush();
    assert.deepEqual(h.played, []);
    current.onUnload();
    enabled = false;
    h.assertRestored();
    new h.MobileAudioSound("user_join").play();
    await h.flush();
    assert.equal(enabled, false);
    assert.deepEqual(h.played, ["user_join"]);
});

test("late cleanup from an old instance does not disable the new instance", async () => {
    const h = harness();
    const first = h.evaluate();
    const second = h.evaluate();
    first.onLoad();
    second.onLoad();
    first.onUnload();
    new h.MobileAudioSound("user_join").play();
    await h.flush();
    assert.deepEqual(h.played, []);
    second.onUnload();
    h.assertRestored();
    new h.MobileAudioSound("user_join").play();
    await h.flush();
    assert.deepEqual(h.played, ["user_join"]);
});

test("captured callbacks stop muting after unload even when unpatch does nothing", async () => {
    const h = harness({ retainCallbacks: true });
    h.plugin.onLoad();
    const audio = new h.MobileAudioSound("user_join");
    const capturedPlay = audio.play.bind(audio);
    capturedPlay();
    await h.flush();
    assert.deepEqual(h.played, []);
    h.plugin.onUnload();
    capturedPlay();
    assert.equal(await audio.playWithListener(), true);
    await h.flush();
    assert.deepEqual(h.played, ["user_join", "user_join"]);
    h.removeRetained();
    h.assertRestored();
});

test("one failed unpatch cannot keep muting or prevent the remaining cleanup", async () => {
    const h = harness({ failUnpatchAt: 1 });
    h.plugin.onLoad();
    h.plugin.onUnload();
    assert.equal(h.cleanupAttempts, 3);
    assert.equal(h.warnings.length, 1);
    const audio = new h.MobileAudioSound("user_leave");
    for (const method of methods) await audio[method]();
    await h.flush();
    assert.deepEqual(h.played, ["user_leave", "user_leave", "user_leave"]);
    h.removeRetained();
    h.assertRestored();
});

test("unrelated Discord sounds retain original asynchronous playback", async () => {
    const h = harness();
    const names = ["message1", "call_ringing", "mute", "unmute", "deafen", "undeafen", "stream_user_joined", "activity_user_join", "custom_sound"];
    h.plugin.onLoad();
    for (const name of names) {
        const audio = new h.MobileAudioSound(name);
        audio.play();
        audio.loop();
        assert.equal(await audio.playWithListener(), true);
    }
    await h.flush();
    assert.deepEqual(h.played, names.flatMap(name => [name, name, name]));
    h.plugin.onUnload();
    h.assertRestored();
});

test("muted playWithListener still completes its caller's callback", async () => {
    const h = harness();
    h.plugin.onLoad();
    let completed = false;
    await new h.MobileAudioSound("user_join").playWithListener().then(result => { completed = result; });
    assert.equal(completed, true);
    assert.deepEqual(h.played, []);
    h.plugin.onUnload();
});

test("missing sound API fails explicitly and leaves playback untouched", () => {
    const h = harness({ missingPlayer: true });
    assert.throws(() => h.plugin.onLoad(), /MobileAudioSound.play was not found/);
    h.plugin.onUnload();
    h.assertRestored();
});

test("partially installed patches are removed when enabling fails", async () => {
    const h = harness({ failPatchAt: 2 });
    assert.throws(() => h.plugin.onLoad(), /could not intercept Discord sounds/);
    h.plugin.onUnload();
    h.assertRestored();
    new h.MobileAudioSound("user_join").play();
    await h.flush();
    assert.deepEqual(h.played, ["user_join"]);
});

test("failed re-enable removes the preceding plugin instance's interception", async () => {
    const h = harness();
    h.plugin.onLoad();
    h.api.metro.findByProps = () => undefined;
    assert.throws(() => h.plugin.onLoad(), /MobileAudioSound.play was not found/);
    h.assertRestored();
    new h.MobileAudioSound("user_join").play();
    await h.flush();
    assert.deepEqual(h.played, ["user_join"]);
    h.plugin.onUnload();
});

test("disabling preserves another plugin's existing patch", async () => {
    const h = harness();
    let otherCalls = 0;
    const undoOther = patcher.before("play", h.MobileAudioSound.prototype, () => { otherCalls++; });
    h.plugin.onLoad();
    new h.MobileAudioSound("user_join").play();
    await h.flush();
    assert.deepEqual(h.played, []);
    h.plugin.onUnload();
    new h.MobileAudioSound("user_join").play();
    await h.flush();
    assert.deepEqual(h.played, ["user_join"]);
    assert.equal(otherCalls, 2);
    undoOther();
    h.assertRestored();
});

test("published build has the expected manifest version and bundle hash", async () => {
    const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
    assert.equal(manifest.version, "2.0.1");
    assert.equal(manifest.hash, createHash("sha256").update(source).digest("hex"));
});
