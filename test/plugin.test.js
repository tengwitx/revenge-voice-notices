import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import patcher from "spitroast";

const { before, instead } = patcher;

const output = await build({ entryPoints: ["src/index.jsx"], bundle: true, write: false, format: "iife", globalName: "voiceNotices", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
const source = `(() => {${output.outputFiles[0].text}; return voiceNotices.default;})()`;

function harness({ withSound = true, deferSound = false, withPrototype = true, withMetadata = true, prepareError = null } = {}) {
    const handlers = new Map();
    const toasts = [], played = [], stopped = [], released = [], timers = new Map(), callbacks = [], builtinPlayed = [], preparedCalls = [];
    class MobileAudioSound {
        constructor(name) { this.name = name; }
        play() { builtinPlayed.push(this.name); }
        loop() { builtinPlayed.push(this.name); }
        playWithListener() { builtinPlayed.push(this.name); return Promise.resolve(true); }
    }
    const cachedJoin = new MobileAudioSound("user_join");
    let timerId = 0;
    const storage = {};
    const sound = {
        prepare(url, category, id, callback) {
            preparedCalls.push({ name: url, usage: category, id });
            if (id >= 1_000_000_000) {
                assert.ok(["user_join", "user_leave"].includes(url));
                assert.equal(category, "voice");
            }
            assert.equal(Number.isInteger(id), true);
            assert.ok(id > 0 && id < 2147483647);
            const finish = () => callback(prepareError, withMetadata ? { duration: 0.16 } : undefined);
            if (deferSound) callbacks.push(finish);
            else finish();
        },
        play: id => played.push(id), stop: id => stopped.push(id), release: id => released.push(id)
    };
    const stores = {
        UserStore: { getCurrentUser: () => ({ id: "me" }), getUser: id => ({ username: id }) },
        VoiceStateStore: { getVoiceStatesForChannel: () => ({ friend: { userId: "friend", channelId: "a" } }) },
        SelectedChannelStore: { getVoiceChannelId: () => "a" },
        ChannelStore: { getChannel: id => ({ name: `room-${id}` }) }
    };
    const plugin = vm.runInNewContext(source, {
        vendetta: {
            metro: { common: { React: {
                createElement: (type, props, ...children) => typeof type === "function" ? type({ ...props, children }) : { type, props: { ...props, children } },
                useState: value => [value, () => {}]
            }, ReactNative: { NativeModules: withSound ? { DCDSoundManager: sound } : {} }, FluxDispatcher: {
                subscribe: (event, handler) => { assert.equal(handlers.has(event), false); handlers.set(event, handler); },
                unsubscribe: (event, handler) => { if (handlers.get(event) === handler) handlers.delete(event); }
            } }, findByStoreName: name => stores[name], findByProps: () => withPrototype ? { MobileAudioSound } : undefined },
            patcher: { before, instead },
            plugin: { storage, id: "https://example.com/voice-notices/", manifest: { version: "1.2.0" } },
            storage: { useProxy() {} },
            ui: { components: { Forms: Object.fromEntries(["FormRow", "FormSection", "FormSwitchRow", "FormInput", "FormText"].map(name => [name, name])) }, toasts: { showToast: text => toasts.push(text) } },
            logger: { warn() {}, error() {} }
        },
        setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
        clearTimeout: id => timers.delete(id)
    });
    const dispatch = (event, payload = {}) => handlers.get(event)?.(payload);
    const flush = () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } };
    const rows = () => {
        const found = [];
        function visit(node) {
            if (!node || typeof node !== "object") return;
            if (Array.isArray(node)) return node.forEach(visit);
            if (node.type === "FormRow") found.push(node.props);
            visit(node.props?.children);
        }
        visit(plugin.settings());
        return found;
    };
    return { plugin, storage, toasts, played, stopped, released, handlers, dispatch, flush, callbacks, stores, sound, MobileAudioSound, cachedJoin, builtinPlayed, preparedCalls, rows };
}

test("regression: sounds use bundled Discord resources on the voice audio route", () => {
    const h = harness();
    h.plugin.onLoad();
    assert.deepEqual(h.preparedCalls.map(({ name, usage }) => ({ name, usage })), [
        { name: "user_join", usage: "voice" }, { name: "user_leave", usage: "voice" }
    ]);
    h.storage.others.sound = true;
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: null }] });
    assert.deepEqual(h.played, [h.preparedCalls[1].id]);
    h.plugin.onUnload();
});

test("regression: switching sound off, on, and off again works without restarting", () => {
    const h = harness();
    h.plugin.onLoad();
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: null }] });
    assert.equal(h.played.length, 0);
    h.storage.others.sound = true;
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: "a" }] });
    assert.deepEqual(h.played, [h.preparedCalls[0].id]);
    h.storage.others.sound = false;
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: null }] });
    assert.equal(h.played.length, 1);
    h.plugin.onUnload();
});

test("regression: successful preparation without metadata still enables sound", () => {
    const h = harness({ withMetadata: false });
    h.plugin.onLoad();
    h.storage.self.sound = true;
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "me", channelId: null }] });
    assert.deepEqual(h.played, [h.preparedCalls[1].id]);
    h.plugin.onUnload();
});

test("regression: settings test buttons bypass muted preferences but not the readiness check", () => {
    const h = harness({ deferSound: true });
    h.plugin.onLoad();
    const join = h.rows().find(row => row.label === "Test join sound");
    join.onPress();
    assert.equal(h.played.length, 0);
    assert.match(h.toasts.at(-1), /Loading/);
    h.callbacks.forEach(callback => callback());
    join.onPress();
    h.rows().find(row => row.label === "Test leave sound").onPress();
    assert.deepEqual(h.played, h.preparedCalls.map(call => call.id));
    assert.equal(h.storage.self.sound, false);
    assert.equal(h.storage.others.sound, false);
    h.plugin.onUnload();
    join.onPress();
    assert.equal(h.played.length, 2);
    assert.match(h.toasts.at(-1), /not enabled/);
});

test("regression: failed preparation is visible from the sound test button", () => {
    const h = harness({ prepareError: "Resource unavailable" });
    h.plugin.onLoad();
    h.rows().find(row => row.label === "Test join sound").onPress();
    assert.equal(h.played.length, 0);
    assert.match(h.toasts.at(-1), /could not load/);
    h.plugin.onUnload();
});

test("regression: cached Discord voice sounds are blocked, unrelated sounds are preserved", async () => {
    const h = harness();
    h.plugin.onLoad();
    h.cachedJoin.play();
    for (const name of ["user_join", "user_leave", "user_moved", "disconnect", "reconnect", "halloween_user_join", "winter_user_leave"]) {
        const audio = new h.MobileAudioSound(name);
        audio.play();
        audio.loop();
        assert.equal(await audio.playWithListener(), true);
    }
    assert.deepEqual(h.builtinPlayed, []);
    for (const name of ["message1", "call_ringing", "mute", "unmute", "deafen", "stream_user_joined", "activity_user_join"]) {
        new h.MobileAudioSound(name).play();
    }
    assert.deepEqual(h.builtinPlayed, ["message1", "call_ringing", "mute", "unmute", "deafen", "stream_user_joined", "activity_user_join"]);
    h.plugin.onUnload();
    h.cachedJoin.play();
    assert.equal(h.builtinPlayed.at(-1), "user_join");
});

test("regression: native playback of prepared Discord voice sounds is blocked, including reused keys", () => {
    const h = harness({ withPrototype: false });
    h.plugin.onLoad();
    h.sound.prepare("user_join", "voice", 10, () => {});
    h.sound.prepare("user_leave", "voice", 11, () => {});
    h.sound.prepare("message1", "notification", 12, () => {});
    h.sound.play(10);
    h.sound.play(11);
    h.sound.play(12);
    assert.deepEqual(h.played, [12]);
    h.sound.release(10);
    h.sound.prepare("mute", "voice", 10, () => {});
    h.sound.play(10);
    h.sound.prepare("user_join", "voice", 20, () => {});
    h.sound.prepare("message1", "notification", 20, () => {});
    h.sound.play(20);
    assert.deepEqual(h.played, [12, 10, 20]);
    h.plugin.onUnload();
    h.sound.play(11);
    assert.equal(h.played.at(-1), 11);
});

test("regression: selective replacement sound respects per-user silence while Discord sound stays blocked", () => {
    const h = harness();
    h.plugin.onLoad();
    h.storage.others.sound = true;
    h.storage.users.friend = { join: true, leave: true, sound: false };
    new h.MobileAudioSound("user_leave").play();
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: null }] });
    assert.deepEqual(h.builtinPlayed, []);
    assert.equal(h.played.length, 0);
    assert.equal(h.toasts.length, 1);
    new h.MobileAudioSound("user_join").play();
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "stranger", channelId: "a" }] });
    assert.deepEqual(h.builtinPlayed, []);
    assert.equal(h.played.length, 1);
    h.plugin.onUnload();
});

test("regression: unsupported sound APIs fail explicitly before registering listeners", () => {
    const h = harness({ withSound: false, withPrototype: false });
    assert.throws(() => h.plugin.onLoad(), /cannot mute Discord sounds/);
    assert.equal(h.handlers.size, 0);
});

test("regression: repeated enable does not stack patches and unload restores playback", () => {
    const h = harness();
    h.plugin.onLoad();
    h.plugin.onLoad();
    h.cachedJoin.play();
    assert.equal(h.builtinPlayed.length, 0);
    h.plugin.onUnload();
    h.cachedJoin.play();
    assert.equal(h.builtinPlayed.length, 1);
    assert.equal(h.handlers.size, 0);
});

test("integration: default notices are silent; preferences and overrides apply immediately", () => {
    const h = harness();
    h.plugin.onLoad();
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: null }] });
    assert.deepEqual(h.toasts, ["friend left room-a"]);
    assert.equal(h.played.length, 0);
    h.storage.others.sound = true;
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: "a" }] });
    assert.equal(Number.isInteger(h.played[0]), true);
    h.storage.users.friend = { join: false, leave: false, sound: true };
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: null }] });
    assert.equal(h.toasts.length, 2);
    assert.equal(h.played.length, 1);
    h.plugin.onUnload();
});

test("integration: text notices still work without the native sound module", () => {
    const h = harness({ withSound: false });
    h.plugin.onLoad();
    h.storage.others.sound = true;
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: null }] });
    assert.equal(h.toasts.length, 1);
    assert.equal(h.played.length, 0);
    h.plugin.onUnload();
});

test("integration: reconnect resets baseline without replaying notices", () => {
    const h = harness();
    h.plugin.onLoad();
    h.dispatch("CONNECTION_RESUMED");
    h.flush();
    h.dispatch("VOICE_STATE_UPDATES", { voiceStates: [{ userId: "friend", channelId: "a" }] });
    assert.equal(h.toasts.length, 0);
    h.plugin.onUnload();
});

test("integration: unloading removes subscriptions and releases prepared sounds", () => {
    const h = harness();
    h.plugin.onLoad();
    assert.equal(h.handlers.size, 3);
    h.plugin.onUnload();
    h.flush();
    assert.equal(h.handlers.size, 0);
    assert.equal(h.stopped.length, 2);
    assert.equal(h.released.length, 2);
    h.plugin.onUnload();
    assert.equal(h.stopped.length, 2);
});

test("integration: late preparation callbacks after unload release sounds without playing", () => {
    const h = harness({ deferSound: true });
    h.plugin.onLoad();
    h.plugin.onUnload();
    h.callbacks.forEach(callback => callback());
    h.flush();
    assert.equal(h.released.length, 2);
    assert.equal(h.played.length, 0);
});

test("integration: missing required stores fail before registering listeners", () => {
    const h = harness();
    delete h.stores.VoiceStateStore.getVoiceStatesForChannel;
    assert.throws(() => h.plugin.onLoad(), /required voice stores/);
    assert.equal(h.handlers.size, 0);
});

test("build: manifest hash is valid and audio uses no remote files", async () => {
    const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
    const bundle = await readFile("dist/index.js");
    assert.equal(manifest.hash, createHash("sha256").update(bundle).digest("hex"));
    assert.doesNotMatch(bundle.toString(), /join\.wav|leave\.wav/);
});
