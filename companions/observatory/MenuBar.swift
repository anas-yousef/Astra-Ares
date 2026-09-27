import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate {
    var item: NSStatusItem!
    var timer: Timer?
    var report: [String: Any]?
    var failure = false
    var window: NSWindow!
    var content: NSStackView!
    var inFlight = false
    var selectedProfile = "legacy"
    let port = ProcessInfo.processInfo.environment["OBSERVATORY_PORT"] ?? "4319"
    func profileName(_ profile: String) -> String {
        return profile == "legacy" ? "Unknown alias / legacy" : profile == "economy" ? "Astra Ares Economy" : "Astra Ares"
    }
    var floats = UserDefaults.standard.object(forKey: "floatWindow") as? Bool ?? true
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.applicationIconImage = NSImage(systemSymbolName: "chart.bar.xaxis", accessibilityDescription: "Jev Observatory")
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Show Observatory", action: #selector(showWindow), keyEquivalent: "0").target = self
        appMenu.addItem(withTitle: "Quit Jev Observatory", action: #selector(quit), keyEquivalent: "q").target = self
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)
        NSApp.mainMenu = mainMenu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 440, height: 660), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Jev Observatory"
        window.isReleasedWhenClosed = false
        window.level = floats ? .floating : .normal
        window.center()
        window.setFrameAutosaveName("JevObservatoryWindow")
        content = NSStackView()
        content.orientation = .vertical
        content.alignment = .leading
        content.spacing = 12
        content.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(content)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 22),
            content.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -22),
            content.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 20)
        ])
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "Jev"
        item.button?.image = NSImage(systemSymbolName: "chart.bar.xaxis", accessibilityDescription: "Jev metrics")
        item.button?.imagePosition = .imageLeading
        rebuild()
        showWindow()
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in self?.refresh() }
    }
    func line(_ title: String, into menu: NSMenu) {
        let row = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        menu.addItem(row)
    }
    func command(_ title: String, _ action: Selector, into menu: NSMenu) {
        let row = NSMenuItem(title: title, action: action, keyEquivalent: "")
        row.target = self
        menu.addItem(row)
    }
    func rebuild() {
        let menu = NSMenu()
        line("Jev Observatory · All time", into: menu)
        if failure { line("Dashboard offline · last snapshot below", into: menu) }
        if let report = report {
            let groups = report["groups"] as? [[String: Any]] ?? []
            for group in groups {
                let profile = group["profile"] as? String ?? "legacy"
                let total = (group["total"] as? NSNumber)?.doubleValue ?? 0
                menu.addItem(.separator())
                line("\(profileName(profile)) · \(Int(total)) confirmed steps", into: menu)
                for effort in ["low", "medium", "high", "xhigh", "max", "ultra"] {
                    let count = (group[effort] as? NSNumber)?.doubleValue ?? 0
                    let percent = total > 0 ? count / total * 100 : 0
                    line(String(format: "  %@   %.1f%%   (%d)", effort == "xhigh" ? "Extra high" : effort.capitalized, percent, Int(count)), into: menu)
                }
            }
            menu.addItem(.separator())
            let metrics = report["metrics"] as? [String: Any] ?? [:]
            let cost = (metrics["cost"] as? NSNumber)?.doubleValue ?? 0
            let latency = (metrics["p50"] as? NSNumber)?.doubleValue ?? 0
            let steps = (metrics["steps"] as? NSNumber)?.doubleValue ?? 0
            let fresh = (metrics["fresh"] as? NSNumber)?.doubleValue ?? 0
            line(String(format: "Jev cost: $%.4f · p50: %.0f ms", cost, latency), into: menu)
            line(String(format: "Lease reuse: %.1f%% · includes legacy", steps > 0 ? (steps-fresh)/steps*100 : 0), into: menu)
            if let status = report["status"] as? [String: Any], let sync = status["lastSync"] as? String {
                line("Imported: \(sync)", into: menu)
            }
        } else { line("Waiting for local dashboard…", into: menu) }
        menu.addItem(.separator())
        command("Show Observatory", #selector(showWindow), into: menu)
        command("Open dashboard", #selector(openDashboard), into: menu)
        command("Refresh", #selector(refresh), into: menu)
        command("Quit", #selector(quit), into: menu)
        item.menu = menu
        rebuildWindow()
    }
    func label(_ text: String, size: CGFloat = 12, bold: Bool = false) -> NSTextField {
        let label = NSTextField(wrappingLabelWithString: text)
        label.font = bold ? .boldSystemFont(ofSize: size) : .systemFont(ofSize: size)
        return label
    }
    func add(_ view: NSView) {
        content.addArrangedSubview(view)
        view.widthAnchor.constraint(equalTo: content.widthAnchor).isActive = true
    }
    func rebuildWindow() {
        for view in content.arrangedSubviews { content.removeArrangedSubview(view); view.removeFromSuperview() }
        add(label(ProcessInfo.processInfo.environment["OBSERVATORY_DEMO"] == "1" ? "Jev Observatory · DEMO" : "Reasoning, observed.", size: 22, bold: true))
        let status = report?["status"] as? [String: Any]
        let unhealthy = failure || status?["error"] is String
        let state = label(unhealthy ? "Collector unavailable · last snapshot" : "All time · native-confirmed steps")
        state.textColor = unhealthy ? .systemRed : .secondaryLabelColor
        add(state)
        let groups = report?["groups"] as? [[String: Any]] ?? []
        let picker = NSPopUpButton()
        picker.addItems(withTitles: ["Unknown alias / legacy", "Astra Ares", "Astra Ares Economy"])
        picker.selectItem(at: ["legacy", "standard", "economy"].firstIndex(of: selectedProfile) ?? 0)
        picker.target = self
        picker.action = #selector(selectProfile(_:))
        picker.setAccessibilityLabel("Model alias")
        add(picker)
        for profile in [selectedProfile] {
            let group = groups.first { $0["profile"] as? String == profile } ?? [:]
            let total = (group["total"] as? NSNumber)?.doubleValue ?? 0
            add(label("\(profileName(profile)) · \(Int(total))", size: 14, bold: true))
            if total == 0 { add(label("No confirmed records for this alias.")) }
            let rows = NSStackView()
            rows.orientation = .vertical
            rows.alignment = .leading
            rows.spacing = 5
            for effort in ["low", "medium", "high", "xhigh", "max", "ultra"] {
                let count = (group[effort] as? NSNumber)?.doubleValue ?? 0
                let value = total > 0 ? count / total * 100 : 0
                let row = NSStackView()
                row.spacing = 10
                let title = label(effort == "xhigh" ? "Extra high" : effort.capitalized)
                title.widthAnchor.constraint(equalToConstant: 68).isActive = true
                let bar = NSProgressIndicator()
                bar.isIndeterminate = false
                bar.minValue = 0
                bar.maxValue = 100
                bar.doubleValue = value
                bar.setAccessibilityLabel("\(profile) \(effort) distribution")
                let number = label(total > 0 ? String(format: "%.1f%%", value) : "—")
                number.alignment = .right
                number.widthAnchor.constraint(equalToConstant: 55).isActive = true
                row.addArrangedSubview(title)
                row.addArrangedSubview(bar)
                row.addArrangedSubview(number)
                rows.addArrangedSubview(row)
                row.widthAnchor.constraint(equalTo: rows.widthAnchor).isActive = true
            }
            add(rows)
        }
        let separator = NSBox()
        separator.boxType = .separator
        add(separator)
        let metrics = report?["metrics"] as? [String: Any] ?? [:]
        let cost = (metrics["cost"] as? NSNumber)?.doubleValue ?? 0
        let latency = (metrics["p50"] as? NSNumber)?.doubleValue ?? 0
        let steps = (metrics["steps"] as? NSNumber)?.doubleValue ?? 0
        let fresh = (metrics["fresh"] as? NSNumber)?.doubleValue ?? 0
        add(label(report == nil ? "Waiting for local telemetry…" : String(format: "Jev $%.4f   ·   p50 %.0f ms   ·   reuse %.1f%%", cost, latency, steps > 0 ? (steps-fresh)/steps*100 : 0)))
        let imported = label("Includes legacy in totals\nImported: \(status?["lastSync"] as? String ?? "pending")", size: 10)
        imported.textColor = .secondaryLabelColor
        add(imported)
        let controls = NSStackView()
        let toggle = NSButton(checkboxWithTitle: "Keep on top", target: self, action: #selector(toggleFloating))
        toggle.state = floats ? .on : .off
        controls.addArrangedSubview(toggle)
        controls.addArrangedSubview(NSButton(title: "Refresh", target: self, action: #selector(refresh)))
        controls.addArrangedSubview(NSButton(title: "Dashboard", target: self, action: #selector(openDashboard)))
        add(controls)
    }
    @objc func toggleFloating() {
        floats.toggle()
        UserDefaults.standard.set(floats, forKey: "floatWindow")
        window.level = floats ? .floating : .normal
    }
    @objc func selectProfile(_ sender: NSPopUpButton) {
        selectedProfile = ["legacy", "standard", "economy"][sender.indexOfSelectedItem]
        rebuildWindow()
    }
    @objc func showWindow() { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    @objc func refresh() {
        guard !inFlight else { return }
        inFlight = true
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/api/report")!)
        request.timeoutInterval = 8
        URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            let value = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.inFlight = false
                self.failure = error != nil || value == nil
                if let value = value { self.report = value }
                self.rebuild()
            }
        }.resume()
    }
    @objc func openDashboard() { NSWorkspace.shared.open(URL(string: "http://127.0.0.1:\(port)")!) }
    @objc func quit() { NSApplication.shared.terminate(nil) }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
