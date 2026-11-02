import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { warn } from "../log.js"

/**
 * Click-to-focus: a clicked toast opens discord-notify://focus. That link is registered for
 * the current user (HKCU, no admin) to a tiny native app compiled once from the C# below with
 * the .NET Framework compiler that ships with Windows. It starts in milliseconds and brings the
 * terminal window running OpenCode to the front.
 */

const PROTOCOL = "discord-notify"
export const FOCUS_URI = `${PROTOCOL}://focus`

const SOURCE = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

static class Program {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct PROCESSENTRY32 {
    public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID;
    public uint th32ModuleID; public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase;
    public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
  }

  [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snap, ref PROCESSENTRY32 e);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snap, ref PROCESSENTRY32 e);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

  class Proc { public uint Pid; public uint Ppid; public string Name; }

  static Dictionary<uint, Proc> Snapshot() {
    var all = new Dictionary<uint, Proc>();
    IntPtr snap = CreateToolhelp32Snapshot(2, 0);
    if (snap == IntPtr.Zero || snap == new IntPtr(-1)) return all;
    try {
      var e = new PROCESSENTRY32();
      e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
      for (bool ok = Process32FirstW(snap, ref e); ok; ok = Process32NextW(snap, ref e)) {
        all[e.th32ProcessID] = new Proc { Pid = e.th32ProcessID, Ppid = e.th32ParentProcessID, Name = e.szExeFile ?? "" };
      }
    } finally { CloseHandle(snap); }
    return all;
  }

  static IntPtr WindowOf(uint pid) {
    try { return Process.GetProcessById((int)pid).MainWindowHandle; } catch { return IntPtr.Zero; }
  }

  static DateTime StartOf(uint pid) {
    try { return Process.GetProcessById((int)pid).StartTime; } catch { return DateTime.MinValue; }
  }

  // Window hosting an OpenCode process: the process itself (desktop app) or its nearest
  // ancestor with a window (the terminal or editor it runs in).
  static IntPtr HostWindow(Dictionary<uint, Proc> all, Proc start) {
    Proc cur = start;
    for (int i = 0; i < 12 && cur != null; i++) {
      if (string.Equals(cur.Name, "explorer.exe", StringComparison.OrdinalIgnoreCase)) break;
      IntPtr h = WindowOf(cur.Pid);
      if (h != IntPtr.Zero) return h;
      Proc parent;
      if (cur.Ppid == 0 || cur.Ppid == cur.Pid || !all.TryGetValue(cur.Ppid, out parent)) break;
      cur = parent;
    }
    return IntPtr.Zero;
  }

  static void Focus(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    SetForegroundWindow(h);
    if (GetForegroundWindow() == h) return;
    // Tapping Alt lets this process take the foreground when Windows refuses the first try.
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(h);
  }

  static void Main() {
    var all = Snapshot();
    IntPtr best = IntPtr.Zero;
    DateTime newest = DateTime.MinValue;
    foreach (var p in all.Values) {
      if (!p.Name.StartsWith("opencode", StringComparison.OrdinalIgnoreCase)) continue;
      IntPtr h = HostWindow(all, p);
      if (h == IntPtr.Zero) continue;
      DateTime started = StartOf(p.Pid);
      if (best == IntPtr.Zero || started > newest) { best = h; newest = started; }
    }
    if (best != IntPtr.Zero) Focus(best);
  }
}
`

const reg = (args: string[]) =>
  new Promise<void>((resolve, reject) =>
    execFile("reg.exe", args, { windowsHide: true, timeout: 10_000 }, (err) => (err ? reject(err) : resolve())),
  )

const compile = (csc: string, source: string, out: string) =>
  new Promise<void>((resolve, reject) =>
    execFile(
      csc,
      ["/nologo", "/target:winexe", "/optimize+", `/out:${out}`, source],
      { windowsHide: true, timeout: 60_000 },
      (err, stdout) => (err ? reject(new Error(stdout.trim() || err.message)) : resolve()),
    ),
  )

function findCsc(): string | undefined {
  const windir = process.env.WINDIR ?? "C:\\Windows"
  for (const fw of ["Framework64", "Framework"]) {
    const csc = join(windir, "Microsoft.NET", fw, "v4.0.30319", "csc.exe")
    if (existsSync(csc)) return csc
  }
  return undefined
}

async function setup(): Promise<boolean> {
  const csc = findCsc()
  if (!csc) {
    warn("the .NET Framework C# compiler was not found; clicking a notification won't focus the terminal")
    return false
  }
  const hash = createHash("sha256").update(SOURCE).digest("hex").slice(0, 12)
  const dir = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "discord-notify")
  const exe = join(dir, `focus-${hash}.exe`)
  try {
    if (!existsSync(exe)) {
      await mkdir(dir, { recursive: true })
      const source = join(dir, `focus-${hash}.cs`)
      await writeFile(source, SOURCE, "utf8")
      await compile(csc, source, exe)
    }
    const key = `HKCU\\Software\\Classes\\${PROTOCOL}`
    await reg(["add", key, "/ve", "/d", "URL:OpenCode discord-notify", "/f"])
    await reg(["add", key, "/v", "URL Protocol", "/d", "", "/f"])
    await reg(["add", `${key}\\shell\\open\\command`, "/ve", "/d", `"${exe}" "%1"`, "/f"])
    return true
  } catch (err) {
    warn("could not set up click-to-focus for notifications", err)
    return false
  }
}

const READY = Symbol.for("discord-notify.click-focus")

/** Prepares click-to-focus once per process. Resolves to the toast launch URI, or undefined. */
export async function clickToFocusUri(): Promise<string | undefined> {
  if (process.platform !== "win32") return undefined
  const g = globalThis as { [READY]?: Promise<boolean> }
  g[READY] ??= setup()
  return (await g[READY]) ? FOCUS_URI : undefined
}
