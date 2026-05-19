# Export Frame (PNG / JPG) with Remove Background

## Summary

Add a "Frame" export option to the existing export panel, allowing users to export the current playhead frame as a static image (PNG or optimized JPG with quality levels). Includes a "Remove Background" toggle that strips the wallpaper and exports with alpha transparency.

## Location in UI

New tab/option in the existing export panel alongside MP4 and GIF.

## Options

| Option | Values | Default |
|--------|--------|---------|
| Format | PNG / JPG (Low, Medium, High) | PNG |
| Size | 720p, 1080p, Original (reuse existing presets) | Original |
| Include overlays | Toggle (annotations, cursor, webcam) | ON |
| Remove background | Toggle | OFF |

## Behavior Rules

- **Remove background ON** → format locked to PNG, wallpaper layer skipped, canvas retains alpha channel
- **Remove background OFF** → PNG or JPG selectable, wallpaper rendered normally
- **Include overlays OFF** → annotations, cursor overlay not rendered; webcam and video content always rendered
- **JPG quality mapping:** Low = 0.6, Medium = 0.8, High = 0.95

## Technical Flow

1. Get current playhead timestamp from the video editor state
2. Decode the frame at that timestamp via existing `streamingDecoder`/`videoDecoder`
3. Create an offscreen canvas at the selected size preset resolution
4. Render via `frameRenderer`:
   - If `removeBackground: true` → do NOT fill canvas background, skip wallpaper layer
   - If `removeBackground: false` → render wallpaper as normal
   - Always render video content and webcam overlay
   - If `includeOverlays: true` → call `annotationRenderer` for annotations + cursor
5. Export: `canvas.toBlob(mimeType, quality)` → save via Electron dialog (`dialog.showSaveDialog`)

## Files to Create/Modify

### New
- `src/lib/exporter/frameExporter.ts` — core logic: decode frame, render to canvas, export blob

### Modify
- `src/lib/exporter/types.ts` — add `FrameExportConfig` interface
- Export panel component (in `src/components/`) — add Frame tab with format/size/overlay/background options
- Relevant i18n files — add translation keys for new UI strings

## Types

```typescript
interface FrameExportConfig {
  format: 'png' | 'jpeg';
  jpegQuality?: 0.6 | 0.8 | 0.95; // low, medium, high
  size: 'original' | '1080p' | '720p';
  includeOverlays: boolean;
  removeBackground: boolean;
  timestamp: number; // current playhead position in ms
}
```

## Edge Cases

- If video is not loaded/decoded yet → disable export button
- If frame decode fails → show error toast
- Large resolution (4K original) → may take a moment, show brief loading state
