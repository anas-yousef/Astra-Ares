import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { locations, uninstall } from "../install.mjs";
test("uninstall refuses foreign app and changed login settings, preserves data", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "observatory-owner-"));
  const p = locations(home);
  try {
    fs.mkdirSync(p.app, { recursive: true });
    assert.throws(() => uninstall(home), /not owned/);
    fs.mkdirSync(path.join(p.app, "Contents"));
    fs.writeFileSync(
      path.join(p.app, "Contents/observatory-owner"),
      "io.github.miuuyy.astra-ares.observatory",
    );
    fs.mkdirSync(path.dirname(p.plist), { recursive: true });
    fs.writeFileSync(p.plist, "foreign");
    assert.throws(() => uninstall(home), /changed/);
    fs.rmSync(p.plist);
    const data = path.join(home, "metrics.sqlite");
    fs.writeFileSync(data, "preserve");
    uninstall(home);
    assert(!fs.existsSync(p.app));
    assert.equal(fs.readFileSync(data, "utf8"), "preserve");
    uninstall(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
