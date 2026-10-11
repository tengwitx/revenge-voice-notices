const voiceSound = /^(?:(?:halloween|winter|snowsgiving)_)?(?:user_join|user_leave|user_moved|disconnect|reconnect)(?:_(?:halloween|winter|snowsgiving))?$/i;

export function isVoiceSound(name) {
    if (typeof name !== "string") return false;
    const filename = name.split(/[?#]/)[0].split(/[\\/]/).pop().replace(/\.(mp3|ogg|wav)$/i, "");
    return voiceSound.test(filename);
}

export function installVoiceSoundGuard(api, allowedKeys = new Set()) {
    const unpatch = [];
    const names = new Map();
    let blocked = 0;
    let prototypeGuard = false;
    let nativeGuard = false;
    const stop = () => {
        for (const undo of unpatch.splice(0).reverse()) undo();
        names.clear();
    };
    try {
        const prototype = api.metro.findByProps("MobileAudioSound")?.MobileAudioSound?.prototype;
        if (typeof prototype?.play === "function") {
            for (const method of ["play", "loop", "playWithListener"]) {
                if (typeof prototype[method] !== "function") continue;
                unpatch.push(api.patcher.instead(method, prototype, function (args, original) {
                    if (!isVoiceSound(this.name)) return original(...args);
                    blocked++;
                    // playWithListener callers still need their completion callback to resolve.
                    return method === "playWithListener" ? Promise.resolve(true) : undefined;
                }));
            }
            prototypeGuard = true;
        }

        const native = api.metro.common.ReactNative.NativeModules.DCDSoundManager;
        if (["prepare", "play", "release"].every(method => typeof native?.[method] === "function")) {
            unpatch.push(api.patcher.before("prepare", native, ([name, , key]) => {
                if (!allowedKeys.has(key) && isVoiceSound(name)) names.set(key, name);
                else names.delete(key);
            }));
            unpatch.push(api.patcher.instead("play", native, (args, original) => {
                if (!names.has(args[0])) return original(...args);
                blocked++;
            }));
            unpatch.push(api.patcher.before("release", native, ([key]) => { names.delete(key); }));
            nativeGuard = true;
        }
    } catch (error) {
        stop();
        throw new Error(`Voice Notices could not intercept Discord sounds: ${error.message}`);
    }
    if (!prototypeGuard && !nativeGuard) {
        throw new Error("Voice Notices cannot mute Discord sounds on this version. Required sound APIs were not found.");
    }
    return {
        stop,
        describe: () => `${prototypeGuard ? "Discord voice sound interception installed" : "Native fallback installed: restart Discord with this plugin enabled to capture cached sounds"}. Blocked: ${blocked}.`
    };
}
