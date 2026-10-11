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

  // src/index.jsx
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default
  });

  // src/events.js
  var defaultRule = { join: true, leave: true, sound: false };
  function ruleFor(settings, userId, selfId) {
    return settings.users?.[userId] ?? settings[userId === selfId ? "self" : "others"] ?? defaultRule;
  }
  function createTracker(selfId, initialChannel, initialStates = []) {
    const channels = /* @__PURE__ */ new Map();
    for (const state of initialStates) {
      if (state.userId && state.channelId) channels.set(state.userId, state.channelId);
    }
    if (initialChannel) channels.set(selfId, initialChannel);
    return (states) => {
      const oldSelfChannel = channels.get(selfId);
      const changes = [];
      for (const state of states) {
        if (!state.userId || !("channelId" in state)) continue;
        const previous = channels.get(state.userId);
        const next = state.channelId || void 0;
        if (next) channels.set(state.userId, next);
        else channels.delete(state.userId);
        if (previous !== next) changes.push({ userId: state.userId, previous, next });
      }
      const newSelfChannel = channels.get(selfId);
      const notices = [];
      for (const { userId, previous, next } of changes) {
        if (userId !== selfId && oldSelfChannel !== newSelfChannel) continue;
        if (previous && (userId === selfId || previous === oldSelfChannel)) {
          notices.push({ userId, channelId: previous, event: "leave" });
        }
        if (next && (userId === selfId || next === newSelfChannel)) {
          notices.push({ userId, channelId: next, event: "join" });
        }
      }
      return notices;
    };
  }

  // src/sounds.js
  var voiceSound = /^(?:(?:halloween|winter|snowsgiving)_)?(?:user_join|user_leave|user_moved|disconnect|reconnect)(?:_(?:halloween|winter|snowsgiving))?$/i;
  function isVoiceSound(name) {
    if (typeof name !== "string") return false;
    const filename = name.split(/[?#]/)[0].split(/[\\/]/).pop().replace(/\.(mp3|ogg|wav)$/i, "");
    return voiceSound.test(filename);
  }
  function installVoiceSoundGuard(api, allowedKeys = /* @__PURE__ */ new Set()) {
    const unpatch = [];
    const names = /* @__PURE__ */ new Map();
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
          unpatch.push(api.patcher.instead(method, prototype, function(args, original) {
            if (!isVoiceSound(this.name)) return original(...args);
            blocked++;
            return method === "playWithListener" ? Promise.resolve(true) : void 0;
          }));
        }
        prototypeGuard = true;
      }
      const native = api.metro.common.ReactNative.NativeModules.DCDSoundManager;
      if (["prepare", "play", "release"].every((method) => typeof native?.[method] === "function")) {
        unpatch.push(api.patcher.before("prepare", native, ([name, , key]) => {
          if (!allowedKeys.has(key) && isVoiceSound(name)) names.set(key, name);
          else names.delete(key);
        }));
        unpatch.push(api.patcher.instead("play", native, (args, original) => {
          if (!names.has(args[0])) return original(...args);
          blocked++;
        }));
        unpatch.push(api.patcher.before("release", native, ([key]) => {
          names.delete(key);
        }));
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

  // src/index.jsx
  var { React, ReactNative, FluxDispatcher } = vendetta.metro.common;
  var { findByStoreName } = vendetta.metro;
  var { storage, manifest } = vendetta.plugin;
  var { Forms } = vendetta.ui.components;
  var { showToast } = vendetta.ui.toasts;
  var { ScrollView } = ReactNative;
  var { FormSection, FormSwitchRow, FormInput, FormRow, FormText } = Forms;
  var cleanup = () => {
  };
  var soundStatus = "Sound has not been initialized.";
  var guardStatus = () => "Discord voice sound interception is not active.";
  var playNotice = () => showToast("Voice Notices is not enabled.");
  function RuleSettings({ title, rule, onChange }) {
    return /* @__PURE__ */ React.createElement(FormSection, { title }, [["join", "Notify on join"], ["leave", "Notify on leave"], ["sound", "Play notification sound"]].map(
      ([key, label]) => /* @__PURE__ */ React.createElement(FormSwitchRow, { key, label, value: rule[key], onValueChange: (value) => onChange({ ...rule, [key]: value }) })
    ));
  }
  function Settings() {
    vendetta.storage.useProxy(storage);
    const [userId, setUserId] = React.useState("");
    const [error, setError] = React.useState("");
    const [, refreshStatus] = React.useState(0);
    const userStore = findByStoreName("UserStore");
    return /* @__PURE__ */ React.createElement(ScrollView, { contentContainerStyle: { paddingBottom: 32 } }, /* @__PURE__ */ React.createElement(FormSection, { title: `Voice Notices ${manifest.version}` }, /* @__PURE__ */ React.createElement(FormText, null, "Discord's original voice notices are intercepted. Enable Play notification sound to hear Discord's built-in join and leave sounds for the selected users. No audio download is needed. Other Discord sounds are unchanged."), /* @__PURE__ */ React.createElement(FormText, null, guardStatus()), /* @__PURE__ */ React.createElement(FormText, null, soundStatus), /* @__PURE__ */ React.createElement(FormRow, { label: "Refresh sound status", onPress: () => refreshStatus((value) => value + 1) }), /* @__PURE__ */ React.createElement(FormRow, { label: "Test join sound", onPress: () => playNotice("join", true) }), /* @__PURE__ */ React.createElement(FormRow, { label: "Test leave sound", onPress: () => playNotice("leave", true) })), ["self", "others"].map((key) => /* @__PURE__ */ React.createElement(
      RuleSettings,
      {
        key,
        title: key === "self" ? "Yourself" : "Other members",
        rule: storage[key] ?? defaultRule,
        onChange: (rule) => {
          storage[key] = rule;
        }
      }
    )), /* @__PURE__ */ React.createElement(FormSection, { title: "Individual user overrides" }, /* @__PURE__ */ React.createElement(
      FormInput,
      {
        title: "Discord user ID",
        placeholder: "Paste a user ID",
        value: userId,
        keyboardType: "number-pad",
        onChangeText: (value) => {
          setUserId(value);
          setError("");
        }
      }
    ), /* @__PURE__ */ React.createElement(FormRow, { label: "Add user", onPress: () => {
      const value = userId.trim();
      if (!/^[1-9]\d{16,19}$/.test(value)) return setError("Enter a valid Discord user ID (17\u201320 digits).");
      if (storage.users?.[value]) return setError("This user already has an override.");
      storage.users = { ...storage.users, [value]: { ...ruleFor(storage, value, userStore.getCurrentUser()?.id) } };
      setUserId("");
      setError("");
    } }), error ? /* @__PURE__ */ React.createElement(FormText, null, error) : null), Object.entries(storage.users ?? {}).map(([key, rule]) => /* @__PURE__ */ React.createElement(React.Fragment, { key }, /* @__PURE__ */ React.createElement(
      RuleSettings,
      {
        title: `${userStore.getUser(key)?.username ?? "User"} (${key})`,
        rule,
        onChange: (value) => {
          storage.users = { ...storage.users, [key]: value };
        }
      }
    ), /* @__PURE__ */ React.createElement(FormRow, { label: "Remove override", onPress: () => {
      const users = { ...storage.users };
      delete users[key];
      storage.users = users;
    } }))));
  }
  function onLoad() {
    cleanup();
    storage.self ?? (storage.self = { ...defaultRule });
    storage.others ?? (storage.others = { ...defaultRule });
    storage.users ?? (storage.users = {});
    const users = findByStoreName("UserStore");
    const voices = findByStoreName("VoiceStateStore");
    const selected = findByStoreName("SelectedChannelStore");
    const channelStore = findByStoreName("ChannelStore");
    if (!users?.getCurrentUser || !voices?.getVoiceStatesForChannel || !selected?.getVoiceChannelId || !channelStore?.getChannel) {
      throw new Error("Voice Notices: this Discord version does not expose the required voice stores.");
    }
    let tracker;
    let selfId;
    let active = true;
    let resetTimer;
    const sound = ReactNative.NativeModules.DCDSoundManager;
    const ready = /* @__PURE__ */ new Set();
    const prepared = /* @__PURE__ */ new Set();
    const firstSoundId = 1e9 + Math.floor(Math.random() * 5e8) * 2;
    const soundIds = { join: firstSoundId, leave: firstSoundId + 1 };
    const guard = installVoiceSoundGuard(vendetta, new Set(Object.values(soundIds)));
    guardStatus = guard.describe;
    playNotice = (event, testing = false) => {
      if (!ready.has(event)) {
        if (testing) showToast(soundStatus);
        return;
      }
      try {
        Promise.resolve(sound.play(soundIds[event])).catch((error) => {
          soundStatus = "Voice sound playback failed. Restart Discord and try Test join sound.";
          vendetta.logger.error("Voice Notices sound failed", error);
          if (testing) showToast(soundStatus);
        });
      } catch (error) {
        soundStatus = "Voice sound playback failed. Restart Discord and try Test join sound.";
        vendetta.logger.error("Voice Notices sound failed", error);
        if (testing) showToast(soundStatus);
      }
    };
    function reset() {
      selfId = users.getCurrentUser()?.id;
      const channelId = selected.getVoiceChannelId();
      const states = channelId ? Object.values(voices.getVoiceStatesForChannel(channelId) ?? {}) : [];
      tracker = selfId ? createTracker(selfId, channelId, states) : null;
    }
    function onStates({ voiceStates = [] }) {
      if (!tracker || users.getCurrentUser()?.id !== selfId) {
        reset();
        return;
      }
      for (const notice of tracker(voiceStates)) {
        const rule = ruleFor(storage, notice.userId, selfId);
        if (!rule[notice.event]) continue;
        const user = users.getUser(notice.userId);
        const name = notice.userId === selfId ? "You" : user?.globalName ?? user?.username ?? notice.userId;
        const channel = channelStore.getChannel(notice.channelId)?.name ?? "voice channel";
        showToast(`${name} ${notice.event === "join" ? "joined" : "left"} ${channel}`);
        if (rule.sound) playNotice(notice.event);
      }
    }
    function onReconnect() {
      tracker = null;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(reset, 0);
    }
    function release(soundId) {
      try {
        Promise.resolve(sound.stop(soundId)).catch((error) => vendetta.logger.warn("Voice Notices stop failed", error));
        setTimeout(() => {
          try {
            Promise.resolve(sound.release(soundId)).catch((error) => vendetta.logger.warn("Voice Notices release failed", error));
          } catch (error) {
            vendetta.logger.warn("Voice Notices release failed", error);
          }
        }, 100);
      } catch (error) {
        vendetta.logger.warn("Voice Notices stop failed", error);
      }
    }
    cleanup = () => {
      active = false;
      guard.stop();
      guardStatus = () => "Discord voice sound interception is not active.";
      playNotice = () => showToast("Voice Notices is not enabled.");
      clearTimeout(resetTimer);
      FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onStates);
      FluxDispatcher.unsubscribe("CONNECTION_OPEN", onReconnect);
      FluxDispatcher.unsubscribe("CONNECTION_RESUMED", onReconnect);
      for (const soundId of prepared) release(soundId);
      ready.clear();
      prepared.clear();
    };
    try {
      reset();
    } catch (error) {
      cleanup();
      throw error;
    }
    FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onStates);
    FluxDispatcher.subscribe("CONNECTION_OPEN", onReconnect);
    FluxDispatcher.subscribe("CONNECTION_RESUMED", onReconnect);
    soundStatus = "Sound is unavailable on this Discord version. Text notices still work.";
    if (["prepare", "play", "stop", "release"].every((method) => typeof sound?.[method] === "function")) {
      soundStatus = "Loading notification sounds...";
      for (const event of ["join", "leave"]) {
        try {
          sound.prepare(event === "join" ? "user_join" : "user_leave", "voice", soundIds[event], (error) => {
            if (error) {
              soundStatus = "Discord's built-in voice sounds could not load. Restart Discord and try again.";
              vendetta.logger.warn("Voice Notices could not prepare sound", error);
              return;
            }
            if (!active) return release(soundIds[event]);
            prepared.add(soundIds[event]);
            ready.add(event);
            if (ready.size === 2) soundStatus = "Built-in voice sounds are ready. Use Test join sound to check your call volume.";
          });
        } catch (error) {
          soundStatus = "Sound could not load. Text notices still work.";
          vendetta.logger.warn("Voice Notices could not prepare sound", error);
        }
      }
    }
  }
  var index_default = { onLoad, onUnload: () => cleanup(), settings: Settings };
  return __toCommonJS(index_exports);
})();

return voiceNotices.default;})()