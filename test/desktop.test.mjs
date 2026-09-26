import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "smol-toml";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import {
  configWithDesktopFeatureFlags,
  createDesktopEnvScript,
  createLaunchAgentPlist,
  DESKTOP_LABEL,
  readDesktopLauncherSource,
  readDesktopFeatureFlags,
  writeDesktopFeatureFlags,
  installDesktop,
  openDesktop,
  uninstallDesktop,
} from "../src/desktop.mjs";

for (const input of [
  "features.step_model_switching = false\n",
  '[features]\n"step_model_switching" = false\n',
  "['features']\n'reasoning_effort_override' = false\n",
  "features = { step_model_switching = false, memories = true }\n",
  'instructions = """\n[features]\nstep_model_switching = false\n"""\n',
  'large = 9223372036854775807\n[[servers]]\nname = "one"\n',
]) {
  test(`desktop TOML preserves values: ${JSON.stringify(input)}`, () => {
    const expected = parse(input, { integersAsBigInt: true });
    expected.features ??= Object.create(null);
    expected.features.step_model_switching = true;
    expected.features.reasoning_effort_override = true;
    const output = configWithDesktopFeatureFlags(input);
    assert.deepEqual(parse(output, { integersAsBigInt: true }), expected);
    assert.equal(configWithDesktopFeatureFlags(output), output);
  });
}

test("invalid config is not replaced; valid config has a private original backup", () => {
  const home = mkdtempSync(join(os.tmpdir(), "ares-toml-"));
  try {
    const path = join(home, "config.toml");
    const invalid = "[features\n";
    writeFileSync(path, invalid);
    assert.throws(() => writeDesktopFeatureFlags(home));
    assert.equal(readFileSync(path, "utf8"), invalid);
    assert(!existsSync(`${path}.astra-ares.bak`));
    const original =
      "# keep this original\nfeatures.step_model_switching = false\n";
    writeFileSync(path, original);
    writeDesktopFeatureFlags(home);
    writeDesktopFeatureFlags(home);
    assert.equal(readFileSync(`${path}.astra-ares.bak`, "utf8"), original);
    assert.deepEqual(readDesktopFeatureFlags(home).flags, {
      step_model_switching: true,
      reasoning_effort_override: true,
    });
    assert.throws(() => configWithDesktopFeatureFlags("features = false"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktop lifecycle preserves custom home and restores only owned launch settings", (t) => {
  const home = mkdtempSync(join(os.tmpdir(), "ares-desktop-"));
  const saved = {
    ARES_HOME: process.env.ARES_HOME,
    ARES_CONFIG: process.env.ARES_CONFIG,
  };
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const env = new Map([
    ["CODEX_CLI_PATH", "/previous/codex"],
    ["CODEX_HOME", "/previous/home"],
  ]);
  const opened = [];
  try {
    Object.defineProperty(process, "platform", { value: "darwin" });
    t.mock.method(os, "homedir", () => home);
    t.mock.method(childProcess, "execFileSync", (command, args) => {
      if (command === "launchctl") {
        const [action, key, value] = args;
        if (action === "getenv") {
          if (!env.has(key))
            throw Object.assign(new Error("unset"), { status: 1 });
          return env.get(key) + "\n";
        }
        if (action === "setenv") env.set(key, value);
        if (action === "unsetenv") env.delete(key);
        return "";
      }
      if (command === "/usr/bin/open") {
        opened.push(args);
        return "";
      }
      if (args[0] === "--version") return "codex-cli 0.155.0-alpha.9.2\n";
      throw new Error(`Unexpected command: ${command}`);
    });
    syncBuiltinESMExports();
    process.env.ARES_HOME = join(home, "ares");
    process.env.ARES_CONFIG = join(home, "config.json");
    const binary = join(home, "codex");
    writeFileSync(
      binary,
      "CODEX_STEP_CONTROLLER_CONTEXT_V3 Jev requires its bridge Astra Ares Luna Ares Sol Ares",
    );
    writeFileSync(join(home, "codex-code-mode-host"), "");
    writeFileSync(
      process.env.ARES_CONFIG,
      JSON.stringify({ provider: "openrouter", codexBinary: binary }),
    );
    const custom = join(home, "custom profile");
    const installed = installDesktop({ codexHome: custom });
    openDesktop();
    assert.equal(env.get("CODEX_HOME"), custom);
    assert(opened[0].includes(`CODEX_HOME=${custom}`));
    assert(!existsSync(join(home, ".codex", "config.toml")));
    uninstallDesktop();
    assert.equal(env.get("CODEX_CLI_PATH"), "/previous/codex");
    assert.equal(env.get("CODEX_HOME"), "/previous/home");
    assert(!existsSync(installed.plist));
    assert(!existsSync(installed.state));
    assert.equal(
      readDesktopFeatureFlags(custom).flags.step_model_switching,
      true,
    );
    uninstallDesktop();
    assert.equal(env.get("CODEX_HOME"), "/previous/home");

    installDesktop({ codexHome: custom });
    env.set("CODEX_CLI_PATH", "/another/tool");
    uninstallDesktop();
    assert.equal(env.get("CODEX_CLI_PATH"), "/another/tool");
    assert.equal(env.get("CODEX_HOME"), "/previous/home");

    env.clear();
    installDesktop({ codexHome: custom });
    installDesktop({ codexHome: join(home, "second") });
    openDesktop();
    assert.equal(env.get("CODEX_HOME"), join(home, "second"));
    uninstallDesktop();
    assert.equal(env.size, 0);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    Object.defineProperty(process, "platform", originalPlatform);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktop env script sets the app-server override without leaking through PATH", () => {
  const script = createDesktopEnvScript({
    launcher: "/Users/example/Astra Ares/bin/codex-desktop-launcher.mjs",
    codexHome: "/Users/example/.codex",
  });
  assert.match(script, /^#!\/usr\/bin\/env zsh/);
  assert.match(
    script,
    /launchctl setenv CODEX_CLI_PATH '\/Users\/example\/Astra Ares\/bin\/codex-desktop-launcher\.mjs'/,
  );
  assert.match(
    script,
    /launchctl setenv CODEX_HOME '\/Users\/example\/\.codex'/,
  );
  assert(!script.includes("CODEX_ELECTRON_USER_DATA_PATH"));
});

test("desktop LaunchAgent runs the env script at login and escapes XML paths", () => {
  const plist = createLaunchAgentPlist({
    envScript: "/Users/example/A&B/bin/env",
    stdout: "/Users/example/logs/out.log",
    stderr: "/Users/example/logs/err.log",
  });
  assert.match(plist, new RegExp(`<string>${DESKTOP_LABEL}</string>`));
  assert.match(plist, /<key>RunAtLoad<\/key>\n  <true\/>/);
  assert.match(plist, /\/Users\/example\/A&amp;B\/bin\/env/);
  assert.match(plist, /\/Users\/example\/logs\/out\.log/);
  assert.match(plist, /\/Users\/example\/logs\/err\.log/);
});

test("desktop launcher keeps app-server stdio clean", () => {
  const source = readDesktopLauncherSource();
  assert(!source.includes("console.log"));
  assert(!source.includes("console.error"));
  assert.match(source, /recordDesktopLauncherError/);
});

test("desktop config appends feature flags when the features table is missing", () => {
  assert.equal(
    configWithDesktopFeatureFlags('model = "gpt-6-astra"\n'),
    'model = "gpt-6-astra"\n\n[features]\nstep_model_switching = true\nreasoning_effort_override = true\n',
  );
});

test("desktop config inserts missing flags into an existing features table", () => {
  assert.equal(
    configWithDesktopFeatureFlags(
      "[features]\nmemories = true\n\n[projects]\nexample = true\n",
    ),
    "[features]\nmemories = true\nstep_model_switching = true\nreasoning_effort_override = true\n\n[projects]\nexample = true\n",
  );
});

test("desktop config forces disabled Ares feature flags back on", () => {
  assert.equal(
    configWithDesktopFeatureFlags(
      "[features]\nstep_model_switching = false\nreasoning_effort_override = false\n",
    ),
    "[features]\nstep_model_switching = true\nreasoning_effort_override = true\n",
  );
});
