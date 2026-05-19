# Export Frame Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add frame export (PNG/JPG) with remove-background option to the existing export panel.

**Architecture:** Reuse existing `FrameRenderer` to render a single frame at the playhead timestamp, then export via `canvas.toBlob()`. New `frameExporter.ts` orchestrates decode → render → blob. UI adds "Frame" tab to `FormatSelector` and settings in `SettingsPanel`.

**Tech Stack:** React, TypeScript, Canvas API, existing FrameRenderer/videoDecoder infrastructure, Electron dialog API.

---

## Chunk 1: Types and Core Exporter

### Task 1: Add Frame Export Types

**Files:**
- Modify: `src/lib/exporter/types.ts`

- [ ] **Step 1: Add types to types.ts**

```typescript
// Add after GifExportConfig

export type FrameFormat = "png" | "jpeg";
export type JpegQuality = "low" | "medium" | "high";
export type FrameSizePreset = "medium" | "large" | "original";

export const JPEG_QUALITY_MAP: Record<JpegQuality, number> = {
  low: 0.6,
  medium: 0.8,
  high: 0.95,
};

export const FRAME_SIZE_PRESETS: Record<FrameSizePreset, { maxHeight: number; label: string }> = {
  medium: { maxHeight: 720, label: "Medium (720p)" },
  large: { maxHeight: 1080, label: "Large (1080p)" },
  original: { maxHeight: Infinity, label: "Original" },
};

export interface FrameExportConfig {
  format: FrameFormat;
  jpegQuality: JpegQuality;
  sizePreset: FrameSizePreset;
  includeOverlays: boolean;
  removeBackground: boolean;
  timestamp: number; // milliseconds (playhead position)
}
```

- [ ] **Step 2: Update ExportFormat type**

Change `ExportFormat` from `"mp4" | "gif"` to `"mp4" | "gif" | "frame"`.

- [ ] **Step 3: Update ExportSettings**

Add `frameConfig?: FrameExportConfig` to the `ExportSettings` interface.

- [ ] **Step 4: Commit**

```bash
git add src/lib/exporter/types.ts
git commit -m "feat(export): add frame export types and config"
```

---

### Task 2: Create frameExporter.ts

**Files:**
- Create: `src/lib/exporter/frameExporter.ts`

- [ ] **Step 1: Create the frame exporter module**

```typescript
import type { FrameExportConfig, FrameFormat } from "./types";
import { JPEG_QUALITY_MAP, FRAME_SIZE_PRESETS } from "./types";
import { FrameRenderer } from "./frameRenderer";
import type { FrameRenderConfig } from "./frameRenderer";

export interface FrameExportResult {
  success: boolean;
  blob?: Blob;
  error?: string;
}

/**
 * Calculate output dimensions based on size preset, preserving aspect ratio.
 */
function calculateFrameDimensions(
  sourceWidth: number,
  sourceHeight: number,
  sizePreset: FrameExportConfig["sizePreset"]
): { width: number; height: number } {
  const preset = FRAME_SIZE_PRESETS[sizePreset];
  if (sourceHeight <= preset.maxHeight) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const scale = preset.maxHeight / sourceHeight;
  const width = Math.round(sourceWidth * scale);
  const height = preset.maxHeight;
  // Ensure even dimensions
  return {
    width: width % 2 === 0 ? width : width + 1,
    height: height % 2 === 0 ? height : height + 1,
  };
}

/**
 * Export a single frame as PNG or JPEG blob.
 *
 * @param videoFrame - decoded VideoFrame at the target timestamp
 * @param config - frame export configuration
 * @param renderConfig - base FrameRenderConfig from the current project state
 * @param webcamFrame - optional webcam VideoFrame
 */
export async function exportFrame(
  videoFrame: VideoFrame,
  config: FrameExportConfig,
  renderConfig: Omit<FrameRenderConfig, "width" | "height">,
  webcamFrame?: VideoFrame | null
): Promise<FrameExportResult> {
  try {
    const { width, height } = calculateFrameDimensions(
      renderConfig.videoWidth,
      renderConfig.videoHeight,
      config.sizePreset
    );

    // Build render config with overrides
    const finalRenderConfig: FrameRenderConfig = {
      ...renderConfig,
      width,
      height,
      // If removeBackground, set wallpaper to null/transparent
      wallpaper: config.removeBackground ? null : renderConfig.wallpaper,
      // If not including overlays, clear annotation regions and cursor
      annotationRegions: config.includeOverlays
        ? renderConfig.annotationRegions
        : undefined,
      cursorTelemetry: config.includeOverlays
        ? renderConfig.cursorTelemetry
        : undefined,
      cursorHighlight: config.includeOverlays
        ? renderConfig.cursorHighlight
        : undefined,
      cursorClickTimestamps: config.includeOverlays
        ? renderConfig.cursorClickTimestamps
        : undefined,
    };

    const renderer = new FrameRenderer(finalRenderConfig);
    await renderer.initialize();

    // Convert timestamp from ms to μs for renderFrame
    const timestampUs = config.timestamp * 1000;
    await renderer.renderFrame(videoFrame, timestampUs, webcamFrame);

    const canvas = renderer.getCanvas();

    // Determine format and quality
    const mimeType: string = config.format === "png" ? "image/png" : "image/jpeg";
    const quality =
      config.format === "jpeg" ? JPEG_QUALITY_MAP[config.jpegQuality] : undefined;

    // Export to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, quality);
    });

    renderer.destroy();

    if (!blob) {
      return { success: false, error: "Failed to create image blob" };
    }

    return { success: true, blob };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown export error",
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/exporter/frameExporter.ts
git commit -m "feat(export): add frameExporter module"
```

---

## Chunk 2: UI Integration

### Task 3: Update FormatSelector to include "Frame" option

**Files:**
- Modify: `src/components/video-editor/FormatSelector.tsx`

- [ ] **Step 1: Add "Frame" to format options**

Add a third format option alongside MP4 and GIF. The format value is `"frame"`. Use a camera/image icon (check existing icon imports for consistency). Label: "Frame".

- [ ] **Step 2: Commit**

```bash
git add src/components/video-editor/FormatSelector.tsx
git commit -m "feat(export): add Frame option to FormatSelector"
```

---

### Task 4: Add Frame settings UI to SettingsPanel

**Files:**
- Modify: `src/components/video-editor/SettingsPanel.tsx`

- [ ] **Step 1: Add frame export state to VideoEditor.tsx**

In `VideoEditor.tsx`, add state:
```typescript
const [frameExportConfig, setFrameExportConfig] = useState<FrameExportConfig>({
  format: "png",
  jpegQuality: "high",
  sizePreset: "original",
  includeOverlays: true,
  removeBackground: false,
  timestamp: 0, // will be set at export time from currentTime
});
```

- [ ] **Step 2: Add frame settings section in SettingsPanel**

When `exportFormat === "frame"`, render:
- **Format selector**: PNG / JPG radio/toggle
  - If JPG selected: quality selector (Low / Medium / High)
  - If `removeBackground` is ON: lock to PNG, disable JPG option
- **Size preset**: dropdown with 720p / 1080p / Original
- **Include overlays**: toggle switch
- **Remove background**: toggle switch
  - When toggled ON: force format to PNG

- [ ] **Step 3: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx src/components/video-editor/SettingsPanel.tsx
git commit -m "feat(export): add Frame settings UI in SettingsPanel"
```

---

### Task 5: Wire up export button to frameExporter

**Files:**
- Modify: `src/components/video-editor/VideoEditor.tsx` (or wherever export is triggered)
- Modify: `src/components/video-editor/ExportDialog.tsx` (if needed for progress)

- [ ] **Step 1: Handle "frame" format in export handler**

When the user clicks export and format is `"frame"`:
1. Set `timestamp` from `currentTime` state
2. Get the current VideoFrame at that timestamp (use existing decoder)
3. Build `FrameRenderConfig` from current project settings
4. Call `exportFrame(videoFrame, frameExportConfig, renderConfig, webcamFrame)`
5. If success, trigger Electron save dialog with appropriate extension filter (.png or .jpg)
6. Write blob to chosen path

- [ ] **Step 2: Add file save logic**

```typescript
// Use Electron's dialog
const { dialog } = window.require("electron").remote;
// or use IPC if remote is not available

const extension = config.format === "png" ? "png" : "jpg";
const result = await dialog.showSaveDialog({
  defaultPath: `frame-export.${extension}`,
  filters: [{ name: "Image", extensions: [extension] }],
});

if (!result.canceled && result.filePath) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.promises.writeFile(result.filePath, buffer);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx src/components/video-editor/ExportDialog.tsx
git commit -m "feat(export): wire frame export to save dialog"
```

---

## Chunk 3: i18n and Polish

### Task 6: Add translation keys

**Files:**
- Modify: `src/i18n/locales/en.json` (and other locale files)

- [ ] **Step 1: Add English translation keys**

```json
{
  "export.format.frame": "Frame",
  "export.frame.format": "Format",
  "export.frame.format.png": "PNG",
  "export.frame.format.jpeg": "JPG",
  "export.frame.quality": "Quality",
  "export.frame.quality.low": "Low",
  "export.frame.quality.medium": "Medium",
  "export.frame.quality.high": "High",
  "export.frame.size": "Size",
  "export.frame.includeOverlays": "Include overlays",
  "export.frame.removeBackground": "Remove background",
  "export.frame.removeBackground.hint": "Exports PNG with transparent background"
}
```

- [ ] **Step 2: Add same keys to other locales** (can use English as fallback initially)

- [ ] **Step 3: Commit**

```bash
git add src/i18n/
git commit -m "feat(export): add i18n keys for frame export"
```

---

### Task 7: Edge cases and UX polish

**Files:**
- Modify: `src/components/video-editor/SettingsPanel.tsx`
- Modify: `src/lib/exporter/frameExporter.ts`

- [ ] **Step 1: Disable export button if no video loaded**

Check that video source is available before enabling the frame export button.

- [ ] **Step 2: Show brief loading state during export**

Frame export should be fast (<1s) but show a spinner/loading indicator while processing.

- [ ] **Step 3: Show error toast on failure**

If `exportFrame` returns `{ success: false }`, show an error notification with the error message.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(export): add loading state and error handling for frame export"
```
