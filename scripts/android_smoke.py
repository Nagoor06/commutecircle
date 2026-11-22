"""Exercise the signed release APK on a disposable Android emulator."""
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "io.github.nagoor06.commutecircle.preview"
ARTIFACT = Path("apps/mobile/artifacts/CommuteCircle-0.4.0-preview.apk")
EVIDENCE = Path("apps/mobile/artifacts/startup")


def adb(*args, check=True):
    return subprocess.run(["adb", *args], capture_output=True, text=True,
                          timeout=60, check=check).stdout.strip()


def snapshot(name):
    logs = adb("logcat", "-d", "-s", "AndroidRuntime:E", "ReactNativeJS:E")
    (EVIDENCE / f"{name}-logcat.txt").write_text(logs)
    if f"Process: {PACKAGE}," in logs or "JavascriptException" in logs:
        raise AssertionError(f"Native application crashed.\n{logs[-3500:]}")
    adb("shell", "uiautomator", "dump", "/sdcard/cc-startup.xml", check=False)
    xml = adb("shell", "cat", "/sdcard/cc-startup.xml", check=False)
    (EVIDENCE / f"{name}.xml").write_text(xml)
    try:
        return [n for n in ET.fromstring(xml).iter("node") if n.get("package") == PACKAGE]
    except ET.ParseError:
        return []


def wait_until(name, check):
    deadline = time.monotonic() + 75
    while time.monotonic() < deadline:
        nodes = snapshot(name)
        if check(nodes):
            capture(name)
            return nodes
        time.sleep(1)
    raise AssertionError(f"{name} did not appear in the installed native app")


def capture(name):
    with (EVIDENCE / f"{name}.png").open("wb") as image:
        subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=image, check=True, timeout=30)


def label(node):
    return (node.get("content-desc") or node.get("text") or "").strip()


def booking(nodes):
    return any("Book a ride" in label(n) for n in nodes) and any(
        n.get("class") == "android.widget.EditText" for n in nodes)


def launch():
    result = adb("shell", "am", "start", "-W", "-a", "android.intent.action.MAIN",
                 "-c", "android.intent.category.LAUNCHER", "-n", f"{PACKAGE}/.MainActivity")
    if "Error" in result:
        raise AssertionError(result)


def main():
    if adb("shell", "getprop", "ro.kernel.qemu") != "1":
        raise RuntimeError("Run this test on a disposable emulator")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    adb("install", "-r", str(ARTIFACT))
    adb("logcat", "-c")
    try:
        adb("shell", "cmd", "connectivity", "airplane-mode", "enable")
        adb("shell", "svc", "wifi", "disable")
        assert adb("shell", "settings", "get", "global", "airplane_mode_on") == "1"
        adb("shell", "am", "force-stop", PACKAGE)
        launch()
        nodes = wait_until("offline-cold-launch", booking)
        inbox = next(n for n in nodes if label(n) == "Inbox")
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", inbox.get("bounds")))
        adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
        wait_until("offline-inbox", lambda ns: any("private booking conversations" in label(n) for n in ns))
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        wait_until("back-to-booking", booking)
        adb("shell", "input", "keyevent", "KEYCODE_HOME")
        launch()
        wait_until("reopened", booking)
        adb("shell", "cmd", "connectivity", "airplane-mode", "disable")
        adb("shell", "svc", "wifi", "enable")
        adb("shell", "am", "force-stop", PACKAGE)
        launch()
        wait_until("online-cold-launch", booking)
        print(json.dumps({"offline_launch":"passed", "native_inbox":"passed", "back":"passed",
                          "reopen":"passed", "online_launch":"passed"}))
    finally:
        capture("final")
        adb("shell", "cmd", "connectivity", "airplane-mode", "disable", check=False)
        adb("shell", "svc", "wifi", "enable", check=False)


if __name__ == "__main__":
    main()
