export const defaultRule = { join: true, leave: true, sound: false };

export function ruleFor(settings, userId, selfId) {
    return settings.users?.[userId] ?? settings[userId === selfId ? "self" : "others"] ?? defaultRule;
}

export function createTracker(selfId, initialChannel, initialStates = []) {
    const channels = new Map();
    for (const state of initialStates) {
        if (state.userId && state.channelId) channels.set(state.userId, state.channelId);
    }
    if (initialChannel) channels.set(selfId, initialChannel);

    return states => {
        const oldSelfChannel = channels.get(selfId);
        const changes = [];
        for (const state of states) {
            if (!state.userId || !("channelId" in state)) continue;
            const previous = channels.get(state.userId);
            const next = state.channelId || undefined;
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
