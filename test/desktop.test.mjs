import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDesktopEnvScript,
  createLaunchAgentPlist,
  DESKTOP_LABEL,
  readDesktopLauncherSource,
} from "../src/desktop.mjs";

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
