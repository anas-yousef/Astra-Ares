# Validation receipt

Validated on macOS with Node 24 and the installed Swift toolchain, against upstream main `b201144`.

- Root `npm ci` and `npm test`: 39/39 passed.
- Companion `npm ci` and `npm test`: 3/3 passed, covering multiple importer/lifecycle assertions.
- Companion `npm run build`: passed (non-blocking bundle-size warning).
- Actual `install({home: temporaryDirectory, login: true})`: compiled Swift, built web assets, bundled dependencies, signed application, generated isolated login plist.
- Launched the installed bundle with `OBSERVATORY_DEMO=1` and isolated source/database paths. Synthetic fixture: 100 confirmed steps, 80 fresh decisions, 20% reuse, $0.008 recorded evaluator cost. API and native UI matched.
- Native accessibility/UI inspection: distribution values, profile selector, Keep on top toggle, close and Command-0 reopen, refresh.
- Stopped only the isolated collector: Refresh displayed `Collector unavailable · last snapshot` and retained prior values. Restarting the collector recovered on the next refresh.
- Headed Chromium against the bundled static dashboard: overview, fixture totals, decision dialog, mobile horizontal bounds, no runtime exceptions.
- Actual `uninstall(temporaryDirectory)`: removed isolated owned app/login plist and retained metrics database. Ownership tests reject foreign applications and edited plists.
- No live model requests were generated. Existing personal app/collector were left running separately.

Screenshot `assets/readme/observatory-demo.png` captures the actual native window with synthetic metadata and a visible DEMO label. It contains no private chats, provider generations, or customer data.

Not verified: a physical reboot/login, Intel hardware, notarized distribution, or controlled token-savings benchmarks. Login behavior is verified through the generated RunAtLoad plist, not a claim of reboot testing. Dock reopening uses the same native show-window handler as the tested Command-0 route; a physical Dock click was not separately exercised.
