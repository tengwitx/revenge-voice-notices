const voiceSound = /^(?:(?:halloween|winter|snowsgiving)_)?(?:user_join|user_leave|user_moved|disconnect|reconnect)(?:_(?:halloween|winter|snowsgiving))?$/i;
const guardKey = Symbol.for("revenge.voice-notices.sound-guard");

export function isVoiceSound(name) {
    if (typeof name !== "string") return false;
    const filename = name.split(/[?#]/)[0].split(/[\\/]/).pop().replace(/\.(mp3|ogg|wav)$/i, "");
    return voiceSound.test(filename);
}

export function installVoiceSoundGuard(api) {
    const prototype = api.metro.findByProps("MobileAudioSound")?.MobileAudioSound?.prototype;
    if (typeof prototype?.play !== "function") {
        throw new Error("Voice Notices cannot mute Discord sounds on this version: MobileAudioSound.play was not found.");
    }
    prototype[guardKey]?.();
    const unpatch = [];
    let active = true;
    const stop = () => {
        // Cached callbacks must stop muting even if their unpatch operation fails.
        active = false;
        for (const undo of unpatch.splice(0).reverse()) {
            try {
                undo();
            } catch (error) {
                api.logger?.warn("Voice Notices could not remove a sound patch", error);
            }
        }
        if (prototype[guardKey] === stop) delete prototype[guardKey];
    };
    try {
        for (const method of ["play", "loop", "playWithListener"]) {
            if (typeof prototype[method] !== "function") continue;
            unpatch.push(api.patcher.instead(method, prototype, function (args, original) {
                if (!active || !isVoiceSound(this.name)) return original(...args);
                // Discord callers still need their completion callback to resolve.
                return method === "playWithListener" ? Promise.resolve(true) : undefined;
            }));
        }
        Object.defineProperty(prototype, guardKey, { value: stop, configurable: true });
    } catch (error) {
        stop();
        throw new Error(`Voice Notices could not intercept Discord sounds: ${error.message}`);
    }
    return stop;
}
