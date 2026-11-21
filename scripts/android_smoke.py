"""Launch the actual APK on a disposable Android emulator and retain diagnostics."""
import json
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "io.github.nagoor06.commutecircle.debug"
ACTIVITY = "com.google.androidbrowserhelper.trusted.LauncherActivity"
EVIDENCE = Path("apps/mobile/app/build/reports/startup")
EVIDENCE.mkdir(parents=True, exist_ok=True)


def adb(*args, check=True):
    return subprocess.run(["adb", *args], capture_output=True, text=True,
                          timeout=45, check=check).stdout.strip()


def snapshot(name):
    logs = adb("logcat", "-d")
    (EVIDENCE / f"{name}-logcat.txt").write_text(logs)
    (EVIDENCE / f"{name}-activities.txt").write_text(adb("shell", "dumpsys", "activity", "activities"))
    with (EVIDENCE / f"{name}.png").open("wb") as image:
        subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=image, check=True, timeout=30)
    adb("shell", "uiautomator", "dump", "/sdcard/cc-startup.xml", check=False)
    xml = adb("shell", "cat", "/sdcard/cc-startup.xml", check=False)
    (EVIDENCE / f"{name}.xml").write_text(xml)
    return logs, xml


def assert_no_crash(logs):
    if "FATAL EXCEPTION" in logs and f"Process: {PACKAGE}" in logs:
        lines = logs.splitlines()
        index = next(i for i, line in enumerate(lines) if f"Process: {PACKAGE}" in line)
        raise AssertionError("Android launch crashed:\n" + "\n".join(lines[max(0, index-2):index+35]))


def wait_for_page(name):
    deadline = time.monotonic() + 75
    while time.monotonic() < deadline:
        logs, xml = snapshot(name)
        assert_no_crash(logs)
        try:
            text = " ".join(str(v) for node in ET.fromstring(xml).iter() for v in node.attrib.values()).lower()
        except ET.ParseError:
            text = ""
        if "pickup" in text and ("book a ride" in text or "drop-off" in text):
            return
        time.sleep(3)
    raise AssertionError(f"{name}: booking screen did not load; see startup screenshots, XML and logcat")


if adb("shell", "getprop", "ro.kernel.qemu") != "1":
    raise RuntimeError("This check only runs on a disposable emulator.")
if "package:" not in adb("shell", "pm", "path", "com.android.chrome"):
    raise RuntimeError("The selected system image must include Chrome.")
adb("root", check=False)
adb("wait-for-device")
adb("shell", "sh", "-c", "'echo \"_ --disable-fre --no-default-browser-check --no-first-run\" > /data/local/tmp/chrome-command-line'")
adb("shell", "am", "set-debug-app", "--persistent", "com.android.chrome")
adb("shell", "am", "force-stop", "com.android.chrome")
adb("install", "-r", "apps/mobile/app/build/outputs/apk/debug/app-debug.apk")
adb("logcat", "-c")
try:
    result = adb("shell", "am", "start", "-W", "-a", "android.intent.action.MAIN",
                 "-c", "android.intent.category.LAUNCHER", "-n", f"{PACKAGE}/{ACTIVITY}", check=False)
    (EVIDENCE / "launch.txt").write_text(result)
    wait_for_page("cold-launch")
    adb("shell", "input", "keyevent", "KEYCODE_HOME")
    adb("shell", "am", "start", "-W", "-a", "android.intent.action.MAIN",
        "-c", "android.intent.category.LAUNCHER", "-n", f"{PACKAGE}/{ACTIVITY}")
    wait_for_page("reopen")
    print(json.dumps({"cold_launch": "passed", "reopen": "passed"}))
finally:
    snapshot("final")
    adb("shell", "am", "clear-debug-app", check=False)
