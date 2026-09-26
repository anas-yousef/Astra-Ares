import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { launchWithBridge, verifyBinary } from "./launch.mjs";
import { loadConfig, locations } from "./config.mjs";
import { parse, stringify } from "smol-toml";
import { isDeepStrictEqual } from "node:util";

export const DESKTOP_LABEL = "io.github.miuuyy.astra-ares.desktop";
export const DESKTOP_FEATURE_FLAGS = [
  "step_model_switching",
  "reasoning_effort_override",
];

export function defaultDesktopCodexHome() {
  return join(homedir(), ".codex");
}

export function packagedDesktopLauncherPath() {
  return fileURLToPath(
    new URL("../bin/codex-desktop-launcher.mjs", import.meta.url),
  );
}

export function desktopPaths(config = loadConfig(), options = {}) {
  const home = config.paths.home;
  return {
    launcher: options.launcherPath ?? packagedDesktopLauncherPath(),
    envScript: join(home, "bin/codex-desktop-env"),
    plist: join(
      homedir(),
      "Library/LaunchAgents/io.github.miuuyy.astra-ares.desktop.plist",
    ),
    stdout: join(home, "logs/codex-desktop-env.out.log"),
    stderr: join(home, "logs/codex-desktop-env.err.log"),
    state: join(home, "desktop-state.json"),
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function createDesktopEnvScript({ launcher, codexHome }) {
  return `#!/usr/bin/env zsh
set -euo pipefail

launchctl setenv CODEX_CLI_PATH ${shellQuote(launcher)}
launchctl setenv CODEX_HOME ${shellQuote(codexHome)}
`;
}

export function createLaunchAgentPlist({ envScript, stdout, stderr }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DESKTOP_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(envScript)}</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${xmlEscape(stdout)}</string>

  <key>StandardErrorPath</key>
  <string>${xmlEscape(stderr)}</string>
</dict>
</plist>
`;
}

export function configWithDesktopFeatureFlags(text) {
  const config = parse(text, { integersAsBigInt: true });
  if (
    config.features !== undefined &&
    (!config.features ||
      typeof config.features !== "object" ||
      Array.isArray(config.features))
  )
    throw new Error("Codex features must be a TOML table");
  config.features ??= Object.create(null);
  if (DESKTOP_FEATURE_FLAGS.every((flag) => config.features[flag] === true))
    return text;
  for (const flag of DESKTOP_FEATURE_FLAGS) config.features[flag] = true;
  const next = stringify(config);
  if (!isDeepStrictEqual(parse(next, { integersAsBigInt: true }), config))
    throw new Error("Desktop config TOML round-trip validation failed");
  return next;
}

export function readDesktopFeatureFlags(codexHome = defaultDesktopCodexHome()) {
  const configPath = join(codexHome, "config.toml");
  const flags = Object.fromEntries(
    DESKTOP_FEATURE_FLAGS.map((flag) => [flag, false]),
  );
  if (!existsSync(configPath)) return { configPath, flags };

  const config = parse(readFileSync(configPath, "utf8"));
  for (const flag of DESKTOP_FEATURE_FLAGS)
    flags[flag] = config.features?.[flag] === true;
  return { configPath, flags };
}

export function writeDesktopFeatureFlags(
  codexHome = defaultDesktopCodexHome(),
) {
  mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const configPath = join(codexHome, "config.toml");
  const current = existsSync(configPath)
    ? readFileSync(configPath, "utf8")
    : "";
  const next = configWithDesktopFeatureFlags(current);
  if (next !== current) {
    // Keep the original layout/comments for recovery; never replace this backup.
    if (current && !existsSync(`${configPath}.astra-ares.bak`))
      writeFileSync(`${configPath}.astra-ares.bak`, current, {
        mode: 0o600,
        flag: "wx",
      });
    const tempPath = `${configPath}.${process.pid}.tmp`;
    writeFileSync(tempPath, next, { mode: 0o600 });
    chmodSync(tempPath, 0o600);
    renameSync(tempPath, configPath);
  }
  return configPath;
}

function runChild(binary, args, env = process.env) {
  const child = spawn(binary, args, { stdio: "inherit", env });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 130 : 1)));
  });
}

function hasAppServerCommand(args) {
  return args.includes("app-server");
}

export async function launchDesktopCodex(
  args,
  config = loadConfig(),
  env = process.env,
) {
  const binary = config.codexBinary ?? config.paths.binary;
  verifyBinary(binary);
  if (!hasAppServerCommand(args)) return runChild(binary, args, env);
  return launchWithBridge(args, config, {
    codexHome: env.CODEX_HOME || defaultDesktopCodexHome(),
    ensureDefaultConfig: false,
    runPrefix: "desktop-",
    startType: "desktop_app_server_started",
  });
}

export function recordDesktopLauncherError(
  error,
  args = [],
  env = process.env,
) {
  try {
    const paths = locations(env);
    const dir = join(paths.home, "logs");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(
      join(dir, "codex-desktop-launcher.err.jsonl"),
      JSON.stringify({
        at: new Date().toISOString(),
        type: "desktop_launcher_error",
        argv: args,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }) + "\n",
      { mode: 0o600 },
    );
  } catch {
    // Keep app-server stdio clean even if diagnostics cannot be written.
  }
}

export function writeDesktopFiles(config, { codexHome } = {}) {
  const binary = config.codexBinary ?? config.paths.binary;
  verifyBinary(binary);
  const paths = desktopPaths(config);
  const selectedCodexHome = codexHome || defaultDesktopCodexHome();
  if (!selectedCodexHome.startsWith("/"))
    throw new Error("desktop codex home must be an absolute path");
  if (!existsSync(paths.launcher))
    throw new Error(`Desktop launcher is missing: ${paths.launcher}`);
  const codexConfig = writeDesktopFeatureFlags(selectedCodexHome);
  mkdirSync(dirname(paths.envScript), { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.plist), { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.stdout), { recursive: true, mode: 0o700 });
  writeFileSync(
    paths.envScript,
    createDesktopEnvScript({
      launcher: paths.launcher,
      codexHome: selectedCodexHome,
    }),
    { mode: 0o700 },
  );
  chmodSync(paths.envScript, 0o700);
  writeFileSync(
    paths.plist,
    createLaunchAgentPlist({
      envScript: paths.envScript,
      stdout: paths.stdout,
      stderr: paths.stderr,
    }),
    { mode: 0o644 },
  );
  return { ...paths, codexHome: selectedCodexHome, codexConfig };
}

function userDomain() {
  const uid = process.getuid?.();
  if (!Number.isInteger(uid)) throw new Error("Cannot resolve current user id");
  return `gui/${uid}`;
}

function runLaunchctl(args, options = {}) {
  return execFileSync("launchctl", args, {
    encoding: "utf8",
    stdio: options.ignore ? "ignore" : ["ignore", "pipe", "pipe"],
  });
}

function tryLaunchctl(args) {
  try {
    runLaunchctl(args, { ignore: true });
  } catch {
    // Some cleanup operations fail when the LaunchAgent is not installed yet.
  }
}

function requireMacDesktop() {
  if (process.platform !== "darwin")
    throw new Error("Codex desktop integration is currently macOS-only");
}

function readDesktopState(paths) {
  if (!existsSync(paths.state)) return null;
  const state = JSON.parse(readFileSync(paths.state, "utf8"));
  if (
    state.version !== 1 ||
    typeof state.codexHome !== "string" ||
    !state.codexHome.startsWith("/") ||
    !state.previous ||
    !state.owned ||
    !["CODEX_CLI_PATH", "CODEX_HOME"].every(
      (key) =>
        (state.previous[key] === null ||
          typeof state.previous[key] === "string") &&
        typeof state.owned[key] === "string",
    )
  )
    throw new Error(
      "Invalid desktop installation state; refusing to overwrite it",
    );
  return state;
}

function launchEnv(name) {
  try {
    return runLaunchctl(["getenv", name]).replace(/\n$/, "");
  } catch (error) {
    if (error.status === 1) return null;
    throw error;
  }
}

export function installDesktop({ codexHome } = {}) {
  requireMacDesktop();
  const config = loadConfig();
  const locations = desktopPaths(config);
  const previousState = readDesktopState(locations);
  const selectedHome =
    codexHome ?? previousState?.codexHome ?? defaultDesktopCodexHome();
  const previous = {};
  for (const key of ["CODEX_CLI_PATH", "CODEX_HOME"]) {
    const current = launchEnv(key);
    previous[key] =
      previousState && current === previousState.owned[key]
        ? previousState.previous[key]
        : current;
  }
  const paths = writeDesktopFiles(config, { codexHome: selectedHome });
  const state = {
    version: 1,
    codexHome: selectedHome,
    previous,
    owned: { CODEX_CLI_PATH: paths.launcher, CODEX_HOME: selectedHome },
  };
  const temporary = `${paths.state}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(state, null, 2) + "\n", {
    mode: 0o600,
  });
  renameSync(temporary, paths.state);
  const domain = userDomain();
  tryLaunchctl(["bootout", domain, paths.plist]);
  runLaunchctl(["enable", `${domain}/${DESKTOP_LABEL}`]);
  runLaunchctl(["bootstrap", domain, paths.plist], { ignore: true });
  runLaunchctl(["kickstart", "-k", `${domain}/${DESKTOP_LABEL}`], {
    ignore: true,
  });
  for (const [key, value] of Object.entries(state.owned))
    runLaunchctl(["setenv", key, value]);
  return paths;
}

export function uninstallDesktop() {
  requireMacDesktop();
  const config = loadConfig();
  const paths = desktopPaths(config);
  const state = readDesktopState(paths);
  const domain = userDomain();
  tryLaunchctl(["bootout", domain, paths.plist]);
  tryLaunchctl(["disable", `${domain}/${DESKTOP_LABEL}`]);
  if (state) {
    for (const key of ["CODEX_CLI_PATH", "CODEX_HOME"]) {
      if (launchEnv(key) !== state.owned[key]) continue;
      runLaunchctl(
        state.previous[key] === null
          ? ["unsetenv", key]
          : ["setenv", key, state.previous[key]],
      );
    }
  }
  rmSync(paths.plist, { force: true });
  rmSync(paths.envScript, { force: true });
  rmSync(paths.state, { force: true });
  return paths;
}

export function desktopStatus() {
  requireMacDesktop();
  const config = loadConfig();
  const paths = desktopPaths(config);
  const domain = userDomain();
  let loaded = false;
  try {
    runLaunchctl(["print", `${domain}/${DESKTOP_LABEL}`]);
    loaded = true;
  } catch {
    loaded = false;
  }
  const envValue = (name) => {
    try {
      return runLaunchctl(["getenv", name]).trim();
    } catch {
      return "";
    }
  };
  const codexHome = envValue("CODEX_HOME");
  const codexConfig = readDesktopFeatureFlags(
    codexHome || defaultDesktopCodexHome(),
  );
  return {
    loaded,
    paths,
    codexCliPath: envValue("CODEX_CLI_PATH"),
    codexHome,
    codexConfig,
  };
}

export function openDesktop() {
  requireMacDesktop();
  const paths = installDesktop();
  runLaunchctl(["setenv", "CODEX_CLI_PATH", paths.launcher], {
    ignore: true,
  });
  runLaunchctl(["setenv", "CODEX_HOME", paths.codexHome], { ignore: true });
  execFileSync(
    "/usr/bin/open",
    [
      "-n",
      "--env",
      `CODEX_CLI_PATH=${paths.launcher}`,
      "--env",
      `CODEX_HOME=${paths.codexHome}`,
      "/Applications/ChatGPT.app",
    ],
    { stdio: "ignore" },
  );
  return paths;
}

export function readDesktopLauncherSource() {
  return readFileSync(packagedDesktopLauncherPath(), "utf8");
}
