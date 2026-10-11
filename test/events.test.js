import { test } from "node:test";
import assert from "node:assert/strict";
import { createTracker, defaultRule, ruleFor } from "../src/events.js";

const state = (userId, channelId) => ({ userId, channelId });
const notice = (userId, channelId, event) => ({ userId, channelId, event });

test("joining, leaving, and moving yourself are separate notices", () => {
    const track = createTracker("me");
    assert.deepEqual(track([state("me", "a")]), [notice("me", "a", "join")]);
    assert.deepEqual(track([state("me", "b")]), [notice("me", "a", "leave"), notice("me", "b", "join")]);
    assert.deepEqual(track([state("me", null)]), [notice("me", "b", "leave")]);
});

test("only peers entering or leaving your current room generate notices", () => {
    const track = createTracker("me", "a", [state("friend", "a")]);
    assert.deepEqual(track([state("friend", "b")]), [notice("friend", "a", "leave")]);
    assert.deepEqual(track([state("stranger", "b")]), []);
    assert.deepEqual(track([state("friend", "a")]), [notice("friend", "a", "join")]);
    assert.deepEqual(track([state("friend", null)]), [notice("friend", "a", "leave")]);
});

test("mute, deafen, and duplicate updates do not generate notices", () => {
    const track = createTracker("me", "a", [state("friend", "a")]);
    assert.deepEqual(track([{ ...state("friend", "a"), selfMute: true }]), []);
    assert.deepEqual(track([{ userId: "friend", selfDeaf: true }]), []);
    assert.deepEqual(track([state("friend", "a"), state("friend", "a")]), []);
    assert.deepEqual(track([state("friend", null)]), [notice("friend", "a", "leave")]);
});

test("self joins with a member batch do not announce existing occupants in either order", () => {
    for (const states of [[state("friend", "a"), state("me", "a")], [state("me", "a"), state("friend", "a")]]) {
        const track = createTracker("me");
        assert.deepEqual(track(states), [notice("me", "a", "join")]);
        assert.deepEqual(track([state("friend", null)]), [notice("friend", "a", "leave")]);
    }
});

test("enabling inside a room seeds members without notifying and tracks their departures", () => {
    const track = createTracker("me", "a", [state("friend", "a")]);
    assert.deepEqual(track([state("friend", "a")]), []);
    assert.deepEqual(track([state("friend", null)]), [notice("friend", "a", "leave")]);
});

test("other rooms are ignored while disconnected", () => {
    const track = createTracker("me");
    assert.deepEqual(track([state("friend", "a")]), []);
    assert.deepEqual(track([state("friend", null)]), []);
});

test("per-user overrides take precedence over self and other defaults", () => {
    const self = { join: false, leave: true, sound: false };
    const others = { join: true, leave: false, sound: true };
    const override = { join: false, leave: false, sound: false };
    const settings = { self, others, users: { friend: override, me: override } };
    assert.equal(ruleFor(settings, "friend", "me"), override);
    assert.equal(ruleFor(settings, "me", "me"), override);
    assert.equal(ruleFor(settings, "stranger", "me"), others);
    delete settings.users.me;
    assert.equal(ruleFor(settings, "me", "me"), self);
    assert.deepEqual(ruleFor({}, "stranger", "me"), defaultRule);
    assert.equal(defaultRule.sound, false);
});
