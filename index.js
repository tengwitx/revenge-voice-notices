(() => {var voiceNotices = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default
  });

  // src/sounds.js
  var voiceSound = /^(?:(?:halloween|winter|snowsgiving)_)?(?:user_join|user_leave|user_moved|disconnect|reconnect)(?:_(?:halloween|winter|snowsgiving))?$/i;
  var guardKey = Symbol.for("revenge.voice-notices.sound-guard");
  function isVoiceSound(name) {
    if (typeof name !== "string") return false;
    const filename = name.split(/[?#]/)[0].split(/[\\/]/).pop().replace(/\.(mp3|ogg|wav)$/i, "");
    return voiceSound.test(filename);
  }
  function installVoiceSoundGuard(api) {
    const prototype = api.metro.findByProps("MobileAudioSound")?.MobileAudioSound?.prototype;
    if (typeof prototype?.play !== "function") {
      throw new Error("Voice Notices cannot mute Discord sounds on this version: MobileAudioSound.play was not found.");
    }
    prototype[guardKey]?.();
    const unpatch = [];
    let active = true;
    const stop = () => {
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
        unpatch.push(api.patcher.instead(method, prototype, function(args, original) {
          if (!active || !isVoiceSound(this.name)) return original(...args);
          return method === "playWithListener" ? Promise.resolve(true) : void 0;
        }));
      }
      Object.defineProperty(prototype, guardKey, { value: stop, configurable: true });
    } catch (error) {
      stop();
      throw new Error(`Voice Notices could not intercept Discord sounds: ${error.message}`);
    }
    return stop;
  }

  // src/index.js
  var cleanup = () => {
  };
  function onUnload() {
    const stop = cleanup;
    cleanup = () => {
    };
    stop();
  }
  function onLoad() {
    onUnload();
    cleanup = installVoiceSoundGuard(vendetta);
  }
  var index_default = { onLoad, onUnload };
  return __toCommonJS(index_exports);
})();

return voiceNotices.default;})()