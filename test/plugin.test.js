import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { build } from "esbuild";
import { createHash } from "node:crypto";

const output = await build({ entryPoints: ["src/index.jsx"], bundle: true, write: false, format: "iife", globalName: "voiceNotices", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
const source = `(() => {${output.outputFiles[0].text}; return voiceNotices.default;})()`;

function harness({ withSound = true, deferSound = false } = {}) {
    const handlers = new Map();
    const toasts = [], played = [], stopped = [], released = [], timers = new Map(), callbacks = [];
    let timerId = 0;
    const storage = {};
    const sound = {
        prepare(url, category, id, callback) {
            assert.match(url, /^https:\/\/example.com\/voice-notices\/(join|leave)\.wav$/);
            assert.equal(category, "notification");
            assert.equal(Number.isInteger(id), true);
            assert.ok(id > 0 && id < 2147483647);
            if (deferSound) callbacks.push(() => callback(null, { duration: 0.16 }));
            else callback(null, { duration: 0.16 });
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
            metro: { common: { React: {}, ReactNative: { NativeModules: withSound ? { DCDSoundManager: sound } : {} }, FluxDispatcher: {
                subscribe: (event, handler) => { assert.equal(handlers.has(event), false); handlers.set(event, handler); },
                unsubscribe: (event, handler) => { if (handlers.get(event) === handler) handlers.delete(event); }
            } }, findByStoreName: name => stores[name] },
            plugin: { storage, id: "https://example.com/voice-notices/" },
            ui: { components: { Forms: {} }, toasts: { showToast: text => toasts.push(text) } },
            logger: { warn() {}, error() {} }
        },
        setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
        clearTimeout: id => timers.delete(id)
    });
    const dispatch = (event, payload = {}) => handlers.get(event)?.(payload);
    const flush = () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } };
    return { plugin, storage, toasts, played, stopped, released, handlers, dispatch, flush, callbacks, stores };
}

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

test("build: manifest hash and generated WAV headers are valid", async () => {
    const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
    const bundle = await readFile("dist/index.js");
    assert.equal(manifest.hash, createHash("sha256").update(bundle).digest("hex"));
    for (const name of ["join", "leave"]) {
        const wav = await readFile(`dist/${name}.wav`);
        assert.equal(wav.toString("ascii", 0, 4), "RIFF");
        assert.equal(wav.toString("ascii", 8, 12), "WAVE");
        assert.equal(wav.readUInt32LE(4), wav.length - 8);
        assert.equal(wav.readUInt32LE(40), wav.length - 44);
    }
});
