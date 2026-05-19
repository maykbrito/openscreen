# FFmpeg Post-Processing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional ffmpeg post-processing to exported videos for file size reduction and slight speed-up (1.15x).

**Architecture:** After the existing WebCodecs export writes the MP4 to disk, a new IPC handler runs ffmpeg on the saved file. Two independent checkboxes in the export settings UI control: (1) re-encode with CRF 23 for compression, (2) speed up 1.15x. The ffmpeg binary is bundled via `ffmpeg-static`.

**Tech Stack:** Electron IPC, ffmpeg-static (npm), child_process.execFile, TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/exporter/types.ts` | Modify | Add `compressFile` and `speedUp` to `ExportSettings` |
| `electron/ipc/ffmpegPostProcess.ts` | Create | IPC handler that runs ffmpeg post-processing |
| `electron/ipc/handlers.ts` | Modify | Register new IPC handler |
| `electron/preload.ts` | Modify | Expose `postProcessExport` to renderer |
| `src/components/video-editor/SettingsPanel.tsx` | Modify | Add two checkboxes |
| `src/components/video-editor/VideoEditor.tsx` | Modify | Call post-process after write |
| `src/components/video-editor/ExportDialog.tsx` | Modify | Show "Optimizing..." state |
| `src/i18n/locales/en/settings.json` | Modify | Add i18n strings |

---

## Task 1: Install ffmpeg-static dependency

- [ ] **Step 1: Install package**

```bash
npm install ffmpeg-static
npm install --save-dev @types/ffmpeg-static
```

- [ ] **Step 2: Verify binary resolves**

Create a quick test in node:
```bash
node -e "console.log(require('ffmpeg-static'))"
```
Expected: prints path to ffmpeg binary

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add ffmpeg-static dependency for post-processing"
```

---

## Task 2: Add types to ExportSettings

**Files:**
- Modify: `src/lib/exporter/types.ts`

- [ ] **Step 1: Add new fields to ExportSettings interface**

In `src/lib/exporter/types.ts`, add to the `ExportSettings` interface:

```typescript
export interface ExportSettings {
	format: ExportFormat;
	quality?: ExportQuality;
	gifConfig?: GifExportConfig;
	compressFile?: boolean;  // Re-encode with CRF 23 for ~85-90% size reduction
	speedUp?: boolean;       // Accelerate video by 1.15x
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/exporter/types.ts
git commit -m "feat: add compressFile and speedUp to ExportSettings type"
```

---

## Task 3: Create ffmpeg post-process IPC handler

**Files:**
- Create: `electron/ipc/ffmpegPostProcess.ts`

- [ ] **Step 1: Create the handler module**

```typescript
import { ipcMain } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
	// ffmpeg-static returns the path to the binary
	// In production (packaged app), we need to fix the path
	let ffmpegPath = require("ffmpeg-static") as string;

	// When packaged, the binary is in app.asar.unpacked
	if (ffmpegPath.includes("app.asar")) {
		ffmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
	}

	return ffmpegPath;
}

interface PostProcessOptions {
	filePath: string;
	compress: boolean;
	speedUp: boolean;
}

interface PostProcessResult {
	success: boolean;
	message: string;
	originalSize?: number;
	finalSize?: number;
}

export function registerFfmpegPostProcessHandler(): void {
	ipcMain.handle(
		"post-process-export",
		async (_, options: PostProcessOptions): Promise<PostProcessResult> => {
			const { filePath, compress, speedUp } = options;

			if (!filePath || !path.isAbsolute(filePath)) {
				return { success: false, message: "Invalid file path" };
			}

			if (!compress && !speedUp) {
				return { success: true, message: "No post-processing needed" };
			}

			try {
				const ffmpegPath = getFfmpegPath();
				const stat = await fs.stat(filePath);
				const originalSize = stat.size;

				// Build output path (temp file, will replace original)
				const dir = path.dirname(filePath);
				const ext = path.extname(filePath);
				const base = path.basename(filePath, ext);
				const tempPath = path.join(dir, `${base}_processing${ext}`);

				// Build ffmpeg args
				const args: string[] = ["-y", "-i", filePath];

				if (speedUp) {
					args.push("-vf", "setpts=PTS/1.15");
					args.push("-af", "atempo=1.15");
				}

				if (compress) {
					args.push("-c:v", "libx264", "-crf", "23", "-preset", "medium");
					if (!speedUp) {
						// If only compressing, copy audio unless speed change needed
						args.push("-c:a", "aac");
					} else {
						args.push("-c:a", "aac");
					}
				}

				args.push(tempPath);

				await execFileAsync(ffmpegPath, args, { timeout: 300000 }); // 5 min timeout

				// Replace original with processed file
				await fs.unlink(filePath);
				await fs.rename(tempPath, filePath);

				const finalStat = await fs.stat(filePath);

				return {
					success: true,
					message: "Post-processing complete",
					originalSize,
					finalSize: finalStat.size,
				};
			} catch (error) {
				console.error("FFmpeg post-processing failed:", error);
				// Clean up temp file if it exists
				const dir = path.dirname(filePath);
				const ext = path.extname(filePath);
				const base = path.basename(filePath, ext);
				const tempPath = path.join(dir, `${base}_processing${ext}`);
				try {
					await fs.unlink(tempPath);
				} catch {
					// ignore
				}
				return {
					success: false,
					message: `Post-processing failed: ${String(error)}`,
				};
			}
		}
	);
}
```

- [ ] **Step 2: Register handler in handlers.ts**

In `electron/ipc/handlers.ts`, add import and call at the end of `registerIpcHandlers`:

```typescript
import { registerFfmpegPostProcessHandler } from "./ffmpegPostProcess";

// At end of registerIpcHandlers():
registerFfmpegPostProcessHandler();
```

- [ ] **Step 3: Expose in preload.ts**

In `electron/preload.ts`, add to the electronAPI object:

```typescript
postProcessExport: (options: { filePath: string; compress: boolean; speedUp: boolean }) => {
    return ipcRenderer.invoke("post-process-export", options);
},
```

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/ffmpegPostProcess.ts electron/ipc/handlers.ts electron/preload.ts
git commit -m "feat: add ffmpeg post-process IPC handler"
```

---

## Task 4: Add UI checkboxes to SettingsPanel

**Files:**
- Modify: `src/components/video-editor/SettingsPanel.tsx`
- Modify: `src/i18n/locales/en/settings.json`

- [ ] **Step 1: Add i18n strings**

In `src/i18n/locales/en/settings.json`, add:

```json
"compressFile": "Reduce file size",
"compressFileDescription": "Re-encodes for ~85% smaller file",
"speedUp": "Speed up slightly (1.15x)",
"speedUpDescription": "Accelerates playback by 15%",
"postProcessing": "Post-processing"
```

- [ ] **Step 2: Add checkboxes to SettingsPanel**

In `SettingsPanel.tsx`, after the quality selector section (around line 1879), add a new section for MP4-only post-processing options. The checkboxes should be controlled by props `compressFile`, `speedUp`, `onCompressFileChange`, `onSpeedUpChange`. Only show when format is "mp4".

- [ ] **Step 3: Add state to VideoEditor.tsx**

In `VideoEditor.tsx`, add state:

```typescript
const [compressFile, setCompressFile] = useState(false);
const [speedUp, setSpeedUp] = useState(false);
```

Pass these as props to SettingsPanel and include in ExportSettings when building settings object in `handleOpenExportDialog`.

- [ ] **Step 4: Commit**

```bash
git add src/components/video-editor/SettingsPanel.tsx src/components/video-editor/VideoEditor.tsx src/i18n/locales/en/settings.json
git commit -m "feat: add compress and speed-up checkboxes to export settings UI"
```

---

## Task 5: Integrate post-processing into export flow

**Files:**
- Modify: `src/components/video-editor/VideoEditor.tsx`
- Modify: `src/components/video-editor/ExportDialog.tsx`

- [ ] **Step 1: Add "Optimizing" phase to ExportDialog**

Add a new state/phase for "Optimizing..." with an indeterminate progress bar, shown between "Finalizing" and "Success".

- [ ] **Step 2: Call post-process after writeExportToPath in MP4 flow**

In `VideoEditor.tsx`, in the MP4 export path (around line 1741), after `writeExportToPath` succeeds and if `settings.compressFile || settings.speedUp`:

```typescript
// After successful write
if (settings.compressFile || settings.speedUp) {
    // Update UI to show "Optimizing..." state
    setExportPhase("optimizing");
    
    const result = await window.electronAPI.postProcessExport({
        filePath: targetPath,
        compress: settings.compressFile ?? false,
        speedUp: settings.speedUp ?? false,
    });
    
    if (!result.success) {
        console.error("Post-processing failed:", result.message);
        // Continue anyway - original file is already saved
    }
}
```

- [ ] **Step 3: Add type declaration for electronAPI**

Ensure `window.electronAPI.postProcessExport` is typed. Find the global type declaration file and add:

```typescript
postProcessExport: (options: { filePath: string; compress: boolean; speedUp: boolean }) => Promise<{ success: boolean; message: string; originalSize?: number; finalSize?: number }>;
```

- [ ] **Step 4: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx src/components/video-editor/ExportDialog.tsx
git commit -m "feat: integrate ffmpeg post-processing into export flow"
```

---

## Task 6: Configure electron-builder for ffmpeg-static

**Files:**
- Modify: `electron-builder.json5`

- [ ] **Step 1: Add ffmpeg-static to asarUnpack**

In `electron-builder.json5`, ensure `ffmpeg-static` binary is unpacked from asar:

```json5
"asarUnpack": [
    "node_modules/ffmpeg-static/**"
]
```

- [ ] **Step 2: Commit**

```bash
git add electron-builder.json5
git commit -m "build: unpack ffmpeg-static from asar for runtime access"
```

---

## Task 7: Manual testing

- [ ] **Step 1: Run the app in dev mode**

```bash
npm run dev
```

- [ ] **Step 2: Record a short video, enable "Reduce file size" checkbox, export**

Verify:
- Checkbox appears only for MP4 format
- Export completes with "Optimizing..." phase
- Final file is significantly smaller than without the option

- [ ] **Step 3: Test with "Speed up slightly" enabled**

Verify:
- Video plays back faster
- Audio pitch is preserved (atempo handles this)

- [ ] **Step 4: Test with both enabled simultaneously**

- [ ] **Step 5: Test with neither enabled (regression)**

Verify normal export still works unchanged.
