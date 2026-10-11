import { installVoiceSoundGuard } from "./sounds.js";

let cleanup = () => {};

function onUnload() {
    const stop = cleanup;
    cleanup = () => {};
    stop();
}

function onLoad() {
    onUnload();
    cleanup = installVoiceSoundGuard(vendetta);
}

export default { onLoad, onUnload };
