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

console.log("Built Voice Notices in dist/");
