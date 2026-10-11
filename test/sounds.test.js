import { test } from "node:test";
import assert from "node:assert/strict";
import { isVoiceSound } from "../src/sounds.js";

test("voice sound classification includes resource names and filenames only", () => {
    for (const name of ["user_join", "user_leave", "user_moved", "disconnect", "reconnect", "winter_user_join", "user_leave_halloween", "https://cdn.example.com/user_join.mp3?version=1"]) {
        assert.equal(isVoiceSound(name), true, name);
    }
    for (const name of ["message1", "mute", "call_ringing", "stream_user_joined", "activity_user_join", "join.wav", "unknown", null, 123]) {
        assert.equal(isVoiceSound(name), false, String(name));
    }
});
