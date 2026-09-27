import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.dirname(fileURLToPath(import.meta.url));
const label = "io.github.miuuyy.astra-ares.observatory";
const xml = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function locations(home = os.homedir()) {
  return {
    app: path.join(home, "Applications/Ares Observatory.app"),
    plist: path.join(home, "Library/LaunchAgents/" + label + ".plist"),
  };
}
function owned(app) {
  return (
    fs.existsSync(path.join(app, "Contents/observatory-owner")) &&
    fs.readFileSync(path.join(app, "Contents/observatory-owner"), "utf8") ===
      label
  );
}
export function uninstall(home = os.homedir(), run = execFileSync) {
  const p = locations(home);
  if (fs.existsSync(p.app) && !owned(p.app))
    throw Error("Application is not owned by this installer");
  if (fs.existsSync(p.plist)) {
    const expected = launchPlist(p.app);
    if (fs.readFileSync(p.plist, "utf8") !== expected)
      throw Error("LaunchAgent has changed; refusing to remove it");
    try {
      run("launchctl", ["bootout", `gui/${process.getuid()}`, p.plist]);
    } catch (error) {
      if (![3, 5, 113].includes(error.status)) throw error;
    }
    fs.rmSync(p.plist);
  }
  if (fs.existsSync(p.app)) fs.rmSync(p.app, { recursive: true });
  return p;
}
function launchPlist(app) {
  return `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(path.join(app, "Contents/MacOS/launch"))}</string></array><key>RunAtLoad</key><true/></dict></plist>\n`;
}
export function install({
  home = os.homedir(),
  login = false,
  run = execFileSync,
} = {}) {
  if (process.platform !== "darwin") throw Error("macOS is required");
  const p = locations(home);
  if (fs.existsSync(p.app))
    throw Error(
      "Application already exists; quit and uninstall it before reinstalling",
    );
  if (fs.existsSync(p.plist))
    throw Error("A LaunchAgent already exists; refusing to overwrite it");
  fs.mkdirSync(path.dirname(p.app), { recursive: true });
  const stage = fs.mkdtempSync(path.join(path.dirname(p.app), ".observatory-"));
  try {
    const contents = path.join(stage, "Contents");
    const mac = path.join(contents, "MacOS");
    const resources = path.join(contents, "Resources");
    fs.mkdirSync(mac, { recursive: true });
    fs.mkdirSync(resources);
    run(
      "swiftc",
      [
        path.join(root, "MenuBar.swift"),
        "-o",
        path.join(mac, "Observatory"),
        "-framework",
        "Cocoa",
      ],
      { stdio: "inherit" },
    );
    run(
      process.execPath,
      [path.join(root, "node_modules/vite/bin/vite.js"), "build"],
      { cwd: root, stdio: "inherit" },
    );
    for (const name of ["server", "dist", "node_modules", "package.json"])
      fs.cpSync(path.join(root, name), path.join(resources, name), {
        recursive: true,
      });
    fs.copyFileSync(
      path.join(root, "../../LICENSE"),
      path.join(resources, "LICENSE"),
    );
    fs.writeFileSync(path.join(contents, "observatory-owner"), label);
    fs.writeFileSync(
      path.join(contents, "Info.plist"),
      `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>launch</string><key>CFBundleIdentifier</key><string>${label}</string><key>CFBundleName</key><string>Ares Observatory</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><false/></dict></plist>`,
    );
    const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
    fs.writeFileSync(
      path.join(mac, "launch"),
      `#!/bin/sh\nBASE="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"\n${quote(process.execPath)} "$BASE/Resources/server/index.mjs" &\nCOLLECTOR=$!\ntrap 'kill "$COLLECTOR" 2>/dev/null || true' EXIT\n"$BASE/MacOS/Observatory"\n`,
      { mode: 0o755 },
    );
    run("codesign", ["--force", "--deep", "--sign", "-", stage], {
      stdio: "inherit",
    });
    fs.renameSync(stage, p.app);
    if (login) {
      fs.mkdirSync(path.dirname(p.plist), { recursive: true });
      fs.writeFileSync(p.plist, launchPlist(p.app), {
        flag: "wx",
        mode: 0o600,
      });
    }
    return p;
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (args.some((x) => x !== "--login")) throw Error("Unknown option");
  if (command === "install")
    console.log(install({ login: args.includes("--login") }));
  else if (command === "uninstall") console.log(uninstall());
  else throw Error("Use: node install.mjs install [--login] | uninstall");
}
