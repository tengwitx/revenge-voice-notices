import { createTracker, defaultRule, ruleFor } from "./events.js";
import { installVoiceSoundGuard } from "./sounds.js";

const { React, ReactNative, FluxDispatcher } = vendetta.metro.common;
const { findByStoreName } = vendetta.metro;
const { storage, manifest } = vendetta.plugin;
const { Forms } = vendetta.ui.components;
const { showToast } = vendetta.ui.toasts;
const { ScrollView } = ReactNative;
const { FormSection, FormSwitchRow, FormInput, FormRow, FormText } = Forms;

let cleanup = () => {};
let soundStatus = "Sound has not been initialized.";
let guardStatus = () => "Discord voice sound interception is not active.";
let playNotice = () => showToast("Voice Notices is not enabled.");

function RuleSettings({ title, rule, onChange }) {
    return <FormSection title={title}>
        {[["join", "Notify on join"], ["leave", "Notify on leave"], ["sound", "Play notification sound"]].map(([key, label]) =>
            <FormSwitchRow key={key} label={label} value={rule[key]} onValueChange={value => onChange({ ...rule, [key]: value })} />
        )}
    </FormSection>;
}

function Settings() {
    vendetta.storage.useProxy(storage);
    const [userId, setUserId] = React.useState("");
    const [error, setError] = React.useState("");
    const [, refreshStatus] = React.useState(0);
    const userStore = findByStoreName("UserStore");
    return <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <FormSection title={`Voice Notices ${manifest.version}`}>
            <FormText>Discord's original voice notices are intercepted. Enable Play notification sound to hear Discord's built-in join and leave sounds for the selected users. No audio download is needed. Other Discord sounds are unchanged.</FormText>
            <FormText>{guardStatus()}</FormText>
            <FormText>{soundStatus}</FormText>
            <FormRow label="Refresh sound status" onPress={() => refreshStatus(value => value + 1)} />
            <FormRow label="Test join sound" onPress={() => playNotice("join", true)} />
            <FormRow label="Test leave sound" onPress={() => playNotice("leave", true)} />
        </FormSection>
        {["self", "others"].map(key => <RuleSettings key={key} title={key === "self" ? "Yourself" : "Other members"}
            rule={storage[key] ?? defaultRule} onChange={rule => { storage[key] = rule; }} />)}
        <FormSection title="Individual user overrides">
            <FormInput title="Discord user ID" placeholder="Paste a user ID" value={userId} keyboardType="number-pad"
                onChangeText={value => { setUserId(value); setError(""); }} />
            <FormRow label="Add user" onPress={() => {
                const value = userId.trim();
                if (!/^[1-9]\d{16,19}$/.test(value)) return setError("Enter a valid Discord user ID (17–20 digits).");
                if (storage.users?.[value]) return setError("This user already has an override.");
                storage.users = { ...storage.users, [value]: { ...ruleFor(storage, value, userStore.getCurrentUser()?.id) } };
                setUserId("");
                setError("");
            }} />
            {error ? <FormText>{error}</FormText> : null}
        </FormSection>
        {Object.entries(storage.users ?? {}).map(([key, rule]) => <React.Fragment key={key}>
            <RuleSettings title={`${userStore.getUser(key)?.username ?? "User"} (${key})`} rule={rule}
                onChange={value => { storage.users = { ...storage.users, [key]: value }; }} />
            <FormRow label="Remove override" onPress={() => {
                const users = { ...storage.users };
                delete users[key];
                storage.users = users;
            }} />
        </React.Fragment>)}
    </ScrollView>;
}

function onLoad() {
    cleanup();
    storage.self ??= { ...defaultRule };
    storage.others ??= { ...defaultRule };
    storage.users ??= {};
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
    const ready = new Set();
    const prepared = new Set();
    // Native sound IDs are integers; fresh IDs prevent delayed cleanup from releasing a new instance.
    const firstSoundId = 1_000_000_000 + Math.floor(Math.random() * 500_000_000) * 2;
    const soundIds = { join: firstSoundId, leave: firstSoundId + 1 };
    const guard = installVoiceSoundGuard(vendetta, new Set(Object.values(soundIds)));
    guardStatus = guard.describe;

    playNotice = (event, testing = false) => {
        if (!ready.has(event)) {
            if (testing) showToast(soundStatus);
            return;
        }
        try {
            Promise.resolve(sound.play(soundIds[event])).catch(error => {
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
            Promise.resolve(sound.stop(soundId)).catch(error => vendetta.logger.warn("Voice Notices stop failed", error));
            setTimeout(() => {
                try {
                    Promise.resolve(sound.release(soundId)).catch(error => vendetta.logger.warn("Voice Notices release failed", error));
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
    if (["prepare", "play", "stop", "release"].every(method => typeof sound?.[method] === "function")) {
        soundStatus = "Loading notification sounds...";
        for (const event of ["join", "leave"]) {
            try {
                sound.prepare(event === "join" ? "user_join" : "user_leave", "voice", soundIds[event], error => {
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

export default { onLoad, onUnload: () => cleanup(), settings: Settings };
