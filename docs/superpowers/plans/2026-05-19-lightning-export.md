# Lightning Export Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hardware-accelerated video export (240+ FPS) using WebGPU rendering + WebCodecs/Breeze encoding with strict frame serialization (no flashing/stuttering).

**Architecture:** Sequential per-frame pipeline: decode → draw to intermediate canvas → texture.source.update() → PixiJS WebGPU render → VideoFrame from canvas → encode (wait for completion) → next frame. Speed comes from WebGPU + hardware encoder, NOT from parallelism. Breeze path streams Annex B NALUs to FFmpeg via Electron IPC for stream-copy muxing.

**Tech Stack:** PixiJS v8 (WebGPU backend), WebCodecs VideoEncoder (hardware H.264), mediabunny muxer, FFmpeg (Breeze native path), Electron IPC.

**Critical Bug Prevention:** Recordly has a frame stuttering/flashing bug. Root cause: PixiJS v8 WebGPU renderer submits GPU commands asynchronously. Code calls `renderer.render(stage)` then immediately reads `app.canvas` via `drawImage()` — the read happens before GPU completes the frame, capturing the previous frame. WebGL is synchronous so Legacy never had this issue. Fix: `waitForGPUFrame()` method that calls `device.queue.onSubmittedWorkDone()` between `renderer.render()` and `compositeWithShadows()`. No-op on WebGL. Cost: ~150-200 FPS instead of 240, still much faster than Legacy.

---

## Task 1: Upgrade FrameRenderer to Support WebGPU

**Files:**
- Modify: `src/lib/exporter/frameRenderer.ts:199-216`
- Modify: `src/lib/exporter/types.ts`

- [ ] **Step 1: Add WebGPU preference to FrameRendererConfig**

In `src/lib/exporter/types.ts`, add `preferWebGPU?: boolean` to the renderer config interface.

- [ ] **Step 2: Add staging canvas + WebGPU init to FrameRenderer**

In `frameRenderer.ts`, modify the `init()` method:
- Accept `preferWebGPU` option
- If true, add `preference: "webgpu"` to PixiJS init options  
- Create a staging canvas (`this.stagingCanvas`) for intermediate VideoFrame drawing
- Track `this.frameCount` for the staging window (first ~135 frames at 60fps = 2.25s)

```typescript
// In init(), replace the comment block at lines 211-216:
if (this.config.preferWebGPU) {
  (initOptions as any).preference = "webgpu";
}
await this.app.init(initOptions);

// Add staging canvas for WebGPU texture upload safety
this.stagingCanvas = document.createElement("canvas");
this.stagingCanvas.width = this.config.width;
this.stagingCanvas.height = this.config.height;
this.stagingCtx = this.stagingCanvas.getContext("2d", { willReadFrequently: false })!;
this.frameCount = 0;
```

- [ ] **Step 3: Modify renderFrame to use staging window pattern**

In the `renderFrame` method, before updating the video texture:
- Draw the VideoFrame to `stagingCanvas` first (always — this prevents the race condition)
- Update the texture from the staging canvas: `this.videoTexture.source.update()`
- Increment frameCount

```typescript
// Draw VideoFrame to staging canvas (prevents texture race condition)
this.stagingCtx.drawImage(videoFrame, 0, 0, this.stagingCanvas.width, this.stagingCanvas.height);

// Update texture from staging canvas
if (!this.videoTexture) {
  this.videoTexture = Texture.from(this.stagingCanvas);
  this.videoSprite.texture = this.videoTexture;
} else {
  this.videoTexture.source.update();
}
this.frameCount++;
```

- [ ] **Step 4: Add getRendererType() method**

```typescript
getRendererType(): string {
  return this.app?.renderer?.type === 0x02 ? "webgpu" : "webgl";
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/exporter/frameRenderer.ts src/lib/exporter/types.ts
git commit -m "feat(export): add WebGPU support to FrameRenderer with staging canvas"
```

---

## Task 2: Fix Frame Flashing Bug (waitForGPUFrame)

**Files:**
- Modify: `src/lib/exporter/frameRenderer.ts`

- [ ] **Step 1: Add waitForGPUFrame() method to FrameRenderer**

```typescript
/**
 * On WebGPU, the renderer submits commands asynchronously.
 * We must wait for the GPU to finish before reading the canvas.
 * No-op on WebGL (synchronous).
 */
private async waitForGPUFrame(): Promise<void> {
  if (!this.config.preferWebGPU) return;
  const renderer = this.app?.renderer as any;
  const device: GPUDevice | undefined = renderer?.gpu?.device;
  if (device) {
    await device.queue.onSubmittedWorkDone();
  }
}
```

- [ ] **Step 2: Call waitForGPUFrame() between render and canvas read**

In `renderFrame()`, after `this.app.renderer.render(this.app.stage)` and before `compositeWithShadows()` (which does `drawImage` from the PixiJS canvas):

```typescript
this.app.renderer.render(this.app.stage);
await this.waitForGPUFrame(); // Wait for GPU to finish before reading canvas
this.compositeWithShadows();
```

- [ ] **Step 3: Ensure @webgpu/types is available for GPUDevice type**

Check `tsconfig.json` includes `@webgpu/types` or that `GPUDevice` is available as a global type. If not:
```bash
npm install -D @webgpu/types
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/exporter/frameRenderer.ts
git commit -m "fix(export): waitForGPUFrame prevents flashing by syncing GPU before canvas read"
```

---

## Task 3: Update Lightning Support Detection

**Files:**
- Modify: `src/lib/exporter/lightningSupport.ts`

- [ ] **Step 1: Update detectLightningSupport to check WebGPU**

```typescript
export async function detectLightningSupport(): Promise<{
  supported: boolean;
  reason?: string;
  hasWebGPU: boolean;
  hasWebCodecs: boolean;
}> {
  const platform = window.electronAPI?.platform ?? "unknown";
  if (platform === "linux") {
    return { supported: false, reason: "Lightning not available on Linux", hasWebGPU: false, hasWebCodecs: false };
  }

  const hasWebCodecs = typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
  const hasWebGPU = !!navigator.gpu;

  if (!hasWebCodecs) {
    return { supported: false, reason: "WebCodecs not available", hasWebGPU, hasWebCodecs };
  }

  // Probe hardware encoder
  try {
    const config: VideoEncoderConfig = {
      codec: "avc1.640033",
      width: 1920, height: 1080,
      bitrate: 8_000_000, framerate: 60,
      hardwareAcceleration: "prefer-hardware",
    };
    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) {
      return { supported: false, reason: "No hardware H.264 encoder", hasWebGPU, hasWebCodecs };
    }
  } catch {
    return { supported: false, reason: "Encoder probe failed", hasWebGPU, hasWebCodecs };
  }

  return { supported: true, hasWebGPU, hasWebCodecs };
}
```

- [ ] **Step 2: Update buildPipelinePath**

```typescript
export function buildPipelinePath(rendererType: string, codec: string, acceleration: string): string {
  const renderer = rendererType === "webgpu" ? "WebGPU" : "WebGL";
  return `${renderer} + WebCodecs (${codec}/${acceleration})`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/exporter/lightningSupport.ts
git commit -m "feat(export): update lightning detection with WebGPU probe"
```

---

## Task 4: Wire WebGPU into Export Pipeline

**Files:**
- Modify: `src/lib/exporter/videoExporter.ts`

- [ ] **Step 1: Pass preferWebGPU to FrameRenderer when Lightning**

In the `exportWithEncoderPreference` method, when creating the FrameRenderer config:

```typescript
preferWebGPU: this.isLightning && (await this.hasWebGPU()),
```

Add helper:
```typescript
private async hasWebGPU(): Promise<boolean> {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch { return false; }
}
```

- [ ] **Step 2: Set pipeline path after renderer init**

After renderer.init(), set the pipeline path:

```typescript
if (this.isLightning) {
  const rendererType = renderer.getRendererType();
  this.currentPipelinePath = buildPipelinePath(rendererType, this.config.codec, encoderPreference);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/exporter/videoExporter.ts
git commit -m "feat(export): wire WebGPU preference into Lightning pipeline"
```

---

## Task 5: Breeze Native FFmpeg Path (Electron Main Process)

**Files:**
- Create: `electron/ipc/nativeVideoExport.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Create nativeVideoExport.ts**

Handles FFmpeg session management:
- `startNativeExport(config)` → spawn FFmpeg with `-f h264 -r <fps> -i pipe:0 -an -c:v copy -movflags +faststart <output.mp4>`
- `writeFrame(sessionId, data: Uint8Array)` → write to stdin with backpressure (drain event)
- `finishNativeExport(sessionId)` → close stdin, wait for exit
- `cancelNativeExport(sessionId)` → kill process
- FFmpeg binary resolution: try `ffmpeg-static`, fallback to system `ffmpeg`

```typescript
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

interface ExportSession {
  id: string;
  process: ChildProcess;
  outputPath: string;
  writeQueue: Promise<void>;
  frameRate: number;
}

const sessions = new Map<string, ExportSession>();

function getFFmpegPath(): string {
  try { return require("ffmpeg-static"); } catch {}
  // Fallback to system ffmpeg
  const paths = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"];
  for (const p of paths) {
    try { require("fs").accessSync(p); return p; } catch {}
  }
  throw new Error("FFmpeg not found");
}

export function startNativeExport(config: { width: number; height: number; frameRate: number }): string {
  const id = randomUUID();
  const outputPath = join(tmpdir(), `openscreen-export-${id}.mp4`);
  const ffmpegPath = getFFmpegPath();

  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "h264", "-r", String(config.frameRate),
    "-i", "pipe:0",
    "-an", "-c:v", "copy",
    "-movflags", "+faststart",
    outputPath,
  ];

  const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });
  sessions.set(id, { id, process: proc, outputPath, writeQueue: Promise.resolve(), frameRate: config.frameRate });
  return id;
}

export async function writeNativeFrame(sessionId: string, frameData: Uint8Array): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  session.writeQueue = session.writeQueue.then(() => new Promise<void>((resolve, reject) => {
    const ok = session.process.stdin!.write(Buffer.from(frameData), (err) => {
      if (err) reject(err); else resolve();
    });
    if (!ok) {
      session.process.stdin!.once("drain", resolve);
    }
  }));

  return session.writeQueue;
}

export async function finishNativeExport(sessionId: string): Promise<string> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  await session.writeQueue;
  session.process.stdin!.end();

  await new Promise<void>((resolve, reject) => {
    session.process.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });

  sessions.delete(sessionId);
  return session.outputPath;
}

export function cancelNativeExport(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.process.kill("SIGKILL");
    sessions.delete(sessionId);
  }
}
```

- [ ] **Step 2: Register IPC handlers in handlers.ts**

```typescript
import { startNativeExport, writeNativeFrame, finishNativeExport, cancelNativeExport } from "./nativeVideoExport";

// In the register function:
ipcMain.handle("native-video-export-start", (_event, config) => startNativeExport(config));
ipcMain.handle("native-video-export-write-frame", (_event, sessionId, frameData) => writeNativeFrame(sessionId, frameData));
ipcMain.handle("native-video-export-finish", (_event, sessionId) => finishNativeExport(sessionId));
ipcMain.handle("native-video-export-cancel", (_event, sessionId) => cancelNativeExport(sessionId));
```

- [ ] **Step 3: Expose in preload.ts**

```typescript
nativeVideoExportStart: (config: { width: number; height: number; frameRate: number }) =>
  ipcRenderer.invoke("native-video-export-start", config),
nativeVideoExportWriteFrame: (sessionId: string, frameData: Uint8Array) =>
  ipcRenderer.invoke("native-video-export-write-frame", sessionId, frameData),
nativeVideoExportFinish: (sessionId: string) =>
  ipcRenderer.invoke("native-video-export-finish", sessionId),
nativeVideoExportCancel: (sessionId: string) =>
  ipcRenderer.invoke("native-video-export-cancel", sessionId),
```

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/nativeVideoExport.ts electron/ipc/handlers.ts electron/preload.ts
git commit -m "feat(export): add Breeze native FFmpeg export path via IPC"
```

---

## Task 6: Integrate Breeze Path into VideoExporter

**Files:**
- Modify: `src/lib/exporter/videoExporter.ts`
- Modify: `src/lib/exporter/types.ts`

- [ ] **Step 1: Add Breeze backend preference to types**

In `types.ts`:
```typescript
export type ExportBackend = "webcodecs" | "breeze" | "auto";
```

- [ ] **Step 2: Add Breeze encode path in videoExporter**

When Lightning + Breeze is available:
1. Configure VideoEncoder with `avc: { format: "annexb" }` + `codec: "avc1.640034"` + `prefer-hardware`
2. In encoder output callback: send chunk data via `window.electronAPI.nativeVideoExportWriteFrame()`
3. On finish: call `finishNativeExport()` to get the output MP4 path
4. Read the file as Blob for the export result

Key difference from WebCodecs path: encoder output goes to FFmpeg stdin, NOT to mediabunny muxer.

- [ ] **Step 3: Add auto-detection logic**

```typescript
private async resolveBackend(): Promise<"webcodecs" | "breeze"> {
  if (!this.isLightning) return "webcodecs";
  
  // Check if Breeze (FFmpeg) is available
  const hasBreezeAPI = !!window.electronAPI?.nativeVideoExportStart;
  if (!hasBreezeAPI) return "webcodecs";
  
  // Prefer Breeze for Lightning (stream copy = fastest)
  return "breeze";
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/exporter/videoExporter.ts src/lib/exporter/types.ts
git commit -m "feat(export): integrate Breeze FFmpeg path for Lightning pipeline"
```

---

## Task 7: Audio Muxing for Breeze Path

**Files:**
- Modify: `electron/ipc/nativeVideoExport.ts`

- [ ] **Step 1: Add audio mux function**

After video export finishes, if audio exists, run a second FFmpeg pass:
```
ffmpeg -y -i <video.mp4> -i <audio_source> -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart <final.mp4>
```

- [ ] **Step 2: Add IPC for audio mux**

```typescript
ipcMain.handle("native-video-export-mux-audio", (_event, videoPath, audioPath) => muxAudio(videoPath, audioPath));
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/nativeVideoExport.ts electron/ipc/handlers.ts
git commit -m "feat(export): add audio muxing for Breeze native path"
```

---

## Task 8: UI Wiring & Default Lightning

**Files:**
- Already done: `src/components/video-editor/PipelineSelector.tsx` (redesigned)
- Already done: `src/components/video-editor/VideoEditor.tsx` (default "lightning")
- Modify: `src/i18n/locales/*/settings.json` (add hint keys to all locales)

- [ ] **Step 1: Add i18n hint keys to all locales**

For each locale, add `pipelineLightningHint` and `pipelineLegacyHint` translations.

- [ ] **Step 2: Verify ExportDialog shows Lightning telemetry correctly**

Ensure the FPS display, pipeline path, and beta warning render when Lightning is active.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/ src/components/video-editor/
git commit -m "feat(export): update UI for Lightning default with redesigned pipeline selector"
```

---

## Task 9: End-to-End Testing & Build Verification

- [ ] **Step 1: Run type checking**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

- [ ] **Step 3: Build the app**

```bash
npm run build:mac
```

- [ ] **Step 4: Manual verification**

Open the built app, export a video with Lightning pipeline, verify:
- No frame flashing/stuttering
- FPS counter shows in export dialog
- Pipeline path shows "WebGPU + WebCodecs" or "WebGL + WebCodecs"
- Export completes successfully with playable MP4

- [ ] **Step 5: Final commit & squash if needed**

```bash
git log --oneline feature/lightning-export ^main
```
