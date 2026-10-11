import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

await mkdir("dist", { recursive: true });
const result = await build({
    entryPoints: ["src/index.jsx"], bundle: true, write: false, format: "iife",
    globalName: "voiceNotices", target: "es2020", jsxFactory: "React.createElement", jsxFragment: "React.Fragment"
});
const script = `(() => {${result.outputFiles[0].text}\nreturn voiceNotices.default;})()`;
await writeFile("dist/index.js", script);
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
manifest.hash = createHash("sha256").update(script).digest("hex");
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2));

for (const [name, frequency] of [["join", 880], ["leave", 440]]) {
    const rate = 22050;
    const samples = Math.round(rate * 0.16);
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) {
        const envelope = Math.min(i / (rate * 0.01), 1) * (1 - i / samples);
        wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * i / rate) * envelope * 6500), 44 + i * 2);
    }
    await writeFile(`dist/${name}.wav`, wav);
}
console.log("Built Voice Notices in dist/");
