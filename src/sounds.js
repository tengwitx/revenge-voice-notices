const voiceSound = /^(?:(?:halloween|winter|snowsgiving)_)?(?:user_join|user_leave|user_moved|disconnect|reconnect)(?:_(?:halloween|winter|snowsgiving))?$/i;

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
    const unpatch = [];
    const stop = () => {
        for (const undo of unpatch.splice(0).reverse()) undo();
    };
    try {
        for (const method of ["play", "loop", "playWithListener"]) {
            if (typeof prototype[method] !== "function") continue;
            unpatch.push(api.patcher.instead(method, prototype, function (args, original) {
                if (!isVoiceSound(this.name)) return original(...args);
                // Discord callers still need their completion callback to resolve.
                return method === "playWithListener" ? Promise.resolve(true) : undefined;
            }));
        }
    } catch (error) {
        stop();
        throw new Error(`Voice Notices could not intercept Discord sounds: ${error.message}`);
    }
    return stop;
}
