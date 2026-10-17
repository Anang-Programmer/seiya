import fs from "fs";
import path from "path";

const filesToPatch = [
  "node_modules/orb-ui/dist/orb-ui.js",
  "node_modules/orb-ui/dist/orb-ui.cjs",
];

for (const relPath of filesToPatch) {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, "utf-8");
    if (content.includes("gl_FragColor = vec4(color, edge);")) {
      content = content.replace(
        "gl_FragColor = vec4(color, edge);",
        "gl_FragColor = vec4(color * edge, edge);"
      );
      fs.writeFileSync(fullPath, content, "utf-8");
      console.log(`[patch-orb] Patched premultiplied alpha in ${relPath}`);
    } else {
      console.log(`[patch-orb] Already patched or pattern not found in ${relPath}`);
    }
  }
}
