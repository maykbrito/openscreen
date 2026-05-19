# Wallpapers Expansion + Auto-Save Preferences Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose all 45 wallpapers already on disk and persist user preferences (background, border, shadow, directories, panel height) across sessions.

**Architecture:** Extend existing `wallpaper.ts` to reference 45 images (rename named files to numbered). Extend existing `userPreferences.ts` with new fields. Hook into existing components to save/load.

**Tech Stack:** TypeScript, React, Electron IPC, localStorage

---

## Chunk 1: Wallpapers Expansion

### Task 1: Rename wallpaper files to numbered scheme

**Files:**
- Modify: `public/wallpapers/` (rename 27 named files to wallpaper19-45.jpg)

- [ ] **Step 1: Rename files**

Run this script to rename the 27 non-numbered wallpapers to wallpaper19-45:

```bash
cd /Users/maykbrito/Developer/26/05/openscreen/public/wallpapers

# Mapping (alphabetical order of named files):
mv bluerays.jpeg wallpaper19.jpg
mv cherrypop.jpg wallpaper20.jpg
mv cityscape.jpg wallpaper21.jpg
mv energy-17.jpg wallpaper22.jpg
mv energy-19.jpg wallpaper23.jpg
mv farmvalley.jpg wallpaper24.jpg
mv glassmorphism-3.jpg wallpaper25.jpg
mv glassmorphism-4.jpg wallpaper26.jpg
mv ipad-17-dark.jpg wallpaper27.jpg
mv ipad-17-light.jpg wallpaper28.jpg
mv iridescent-9.jpg wallpaper29.jpg
mv lemonade.jpeg wallpaper30.jpg
mv levels.jpg wallpaper31.jpg
mv luisdelrio.jpg wallpaper32.jpg
mv midnight-8.jpg wallpaper33.jpg
mv mountaintrees.jpg wallpaper34.jpg
mv sequoia-blue-orange.jpg wallpaper35.jpg
mv sequoia-blue.jpg wallpaper36.jpg
mv sonoma-clouds.jpg wallpaper37.jpg
mv sonoma-dark.jpg wallpaper38.jpg
mv sonoma-evening.jpg wallpaper39.jpg
mv sonoma-horizon.jpg wallpaper40.jpg
mv sonoma-light.jpg wallpaper41.jpg
mv tahoe-dark.jpg wallpaper42.jpg
mv tahoe-light.jpg wallpaper43.jpg
mv ventura-dark.jpg wallpaper44.jpg
mv ventura.jpg wallpaper45.jpg
```

- [ ] **Step 2: Remove the video wallpaper (not used)**

```bash
rm /Users/maykbrito/Developer/26/05/openscreen/public/wallpapers/wispysky.mp4
```

- [ ] **Step 3: Verify 45 files exist**

```bash
ls /Users/maykbrito/Developer/26/05/openscreen/public/wallpapers/ | wc -l
# Expected: 45
```

### Task 2: Update wallpaper.ts

**Files:**
- Modify: `src/lib/wallpaper.ts:5`

- [ ] **Step 1: Update WALLPAPER_COUNT**

Change line 5 from:
```typescript
export const WALLPAPER_COUNT = 18;
```
To:
```typescript
export const WALLPAPER_COUNT = 45;
```

- [ ] **Step 2: Verify the app builds**

```bash
cd /Users/maykbrito/Developer/26/05/openscreen && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add public/wallpapers/ src/lib/wallpaper.ts
git commit -m "feat: expand wallpapers from 18 to 45 backgrounds"
```

---

## Chunk 2: Extend User Preferences

### Task 3: Add new fields to userPreferences.ts

**Files:**
- Modify: `src/lib/userPreferences.ts`

- [ ] **Step 1: Add new fields to interface and defaults**

Add to `UserPreferences` interface:
```typescript
/** Selected wallpaper index */
backgroundIndex: number;
/** Border radius in px */
borderRadius: number;
/** Shadow intensity (0-100) */
shadowIntensity: number;
/** Last directory used for opening video files */
lastOpenedDirectory: string | null;
/** Last directory used for exporting */
lastExportDirectory: string | null;
/** Vertical panel split percentage */
panelHeight: number;
```

Add to `DEFAULT_PREFS`:
```typescript
backgroundIndex: 0,
borderRadius: 12,
shadowIntensity: 50,
lastOpenedDirectory: null,
lastExportDirectory: null,
panelHeight: 63.7,
```

- [ ] **Step 2: Add validation in loadUserPreferences()**

Add these validation blocks in the return object:
```typescript
backgroundIndex:
    typeof raw.backgroundIndex === "number" &&
    Number.isInteger(raw.backgroundIndex) &&
    raw.backgroundIndex >= 0 &&
    raw.backgroundIndex < 45
        ? raw.backgroundIndex
        : DEFAULT_PREFS.backgroundIndex,
borderRadius:
    typeof raw.borderRadius === "number" &&
    Number.isFinite(raw.borderRadius) &&
    raw.borderRadius >= 0 &&
    raw.borderRadius <= 50
        ? raw.borderRadius
        : DEFAULT_PREFS.borderRadius,
shadowIntensity:
    typeof raw.shadowIntensity === "number" &&
    Number.isFinite(raw.shadowIntensity) &&
    raw.shadowIntensity >= 0 &&
    raw.shadowIntensity <= 100
        ? raw.shadowIntensity
        : DEFAULT_PREFS.shadowIntensity,
lastOpenedDirectory:
    typeof raw.lastOpenedDirectory === "string" || raw.lastOpenedDirectory === null
        ? (raw.lastOpenedDirectory as string | null)
        : DEFAULT_PREFS.lastOpenedDirectory,
lastExportDirectory:
    typeof raw.lastExportDirectory === "string" || raw.lastExportDirectory === null
        ? (raw.lastExportDirectory as string | null)
        : DEFAULT_PREFS.lastExportDirectory,
panelHeight:
    typeof raw.panelHeight === "number" &&
    Number.isFinite(raw.panelHeight) &&
    raw.panelHeight >= 40 &&
    raw.panelHeight <= 70
        ? raw.panelHeight
        : DEFAULT_PREFS.panelHeight,
```

- [ ] **Step 3: Verify build passes**

```bash
cd /Users/maykbrito/Developer/26/05/openscreen && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/userPreferences.ts
git commit -m "feat: add background, border, shadow, directory, panel prefs"
```

---

## Chunk 3: Hook Preferences into Components

### Task 4: Persist wallpaper selection

**Files:**
- Modify: `src/components/video-editor/VideoEditor.tsx` (~line 103, initialization)
- Modify: `src/components/video-editor/SettingsPanel.tsx` (~line 176, onWallpaperChange)

- [ ] **Step 1: Load backgroundIndex on editor mount**

In `VideoEditor.tsx`, where the initial wallpaper state is set, read from preferences:
```typescript
import { loadUserPreferences, saveUserPreferences } from "@/lib/userPreferences";
import { WALLPAPER_PATHS } from "@/lib/wallpaper";

// In initialization, replace hardcoded default with:
const prefs = loadUserPreferences();
const initialWallpaper = WALLPAPER_PATHS[prefs.backgroundIndex] ?? WALLPAPER_PATHS[0];
```

- [ ] **Step 2: Save on wallpaper change**

In the wallpaper change handler (VideoEditor.tsx), add save call:
```typescript
// After setting the wallpaper state, persist the index:
const wallpaperIndex = WALLPAPER_PATHS.indexOf(newWallpaperPath);
if (wallpaperIndex >= 0) {
    saveUserPreferences({ backgroundIndex: wallpaperIndex });
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/maykbrito/Developer/26/05/openscreen && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx
git commit -m "feat: persist wallpaper selection across sessions"
```

### Task 5: Persist border radius and shadow

**Files:**
- Modify: `src/components/video-editor/VideoEditor.tsx` (borderRadius/shadow state init + onChange)

- [ ] **Step 1: Load borderRadius and shadowIntensity on mount**

Where borderRadius and shadowIntensity state are initialized, use preferences:
```typescript
const prefs = loadUserPreferences();
// Use prefs.borderRadius and prefs.shadowIntensity as initial state values
```

- [ ] **Step 2: Save on change**

In the handlers where borderRadius and shadowIntensity are updated (likely from SettingsPanel callbacks), add:
```typescript
saveUserPreferences({ borderRadius: newValue });
// and
saveUserPreferences({ shadowIntensity: newValue });
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/maykbrito/Developer/26/05/openscreen && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx
git commit -m "feat: persist border radius and shadow across sessions"
```

### Task 6: Persist panel height

**Files:**
- Modify: `src/components/video-editor/VideoEditor.tsx` (~line 1924, PanelGroup)

- [ ] **Step 1: Add onLayout callback to PanelGroup**

The `PanelGroup` component from `react-resizable-panels` supports an `onLayout` prop:
```typescript
<PanelGroup
    direction="vertical"
    onLayout={(sizes: number[]) => {
        // sizes[0] is the top panel percentage
        saveUserPreferences({ panelHeight: sizes[0] });
    }}
>
```

- [ ] **Step 2: Set defaultSize from preferences**

On the first `<Panel>` inside the group:
```typescript
<Panel defaultSize={prefs.panelHeight} minSize={40} maxSize={70}>
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/maykbrito/Developer/26/05/openscreen && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx
git commit -m "feat: persist timeline panel height across sessions"
```

### Task 7: Persist last opened directory

**Files:**
- Modify: `src/components/launch/LaunchWindow.tsx` (~line 280)
- Possibly modify: `electron/ipc/` (if file picker IPC needs defaultPath support)

- [ ] **Step 1: Pass lastOpenedDirectory to file picker**

In `LaunchWindow.tsx`, before calling `window.electronAPI.openVideoFilePicker()`:
```typescript
const prefs = loadUserPreferences();
const result = await window.electronAPI.openVideoFilePicker(prefs.lastOpenedDirectory);
```

Note: This requires the Electron IPC handler to accept a `defaultPath` parameter. Check if it already does; if not, modify the IPC handler.

- [ ] **Step 2: Save directory after file selection**

After the user selects a file:
```typescript
if (filePath) {
    const directory = filePath.substring(0, filePath.lastIndexOf('/'));
    saveUserPreferences({ lastOpenedDirectory: directory });
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/maykbrito/Developer/26/05/openscreen && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/launch/LaunchWindow.tsx electron/
git commit -m "feat: remember last opened video directory"
```

### Task 8: Persist last export directory

**Files:**
- Modify: `src/components/video-editor/VideoEditor.tsx` (~line 1475)
- Possibly modify: `electron/ipc/` (if save dialog IPC needs defaultPath)

- [ ] **Step 1: Pass lastExportDirectory to save dialog**

Before calling `window.electronAPI.saveExportedVideo()`:
```typescript
const prefs = loadUserPreferences();
// Pass defaultPath to the save dialog
const result = await window.electronAPI.saveExportedVideo(arrayBuffer, fileName, prefs.lastExportDirectory);
```

- [ ] **Step 2: Save directory after export**

After successful save:
```typescript
if (savedPath) {
    const directory = savedPath.substring(0, savedPath.lastIndexOf('/'));
    saveUserPreferences({ lastExportDirectory: directory });
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/maykbrito/Developer/26/05/openscreen && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx electron/
git commit -m "feat: remember last export directory"
```

---

## Final Verification

- [ ] **Full build passes:** `npm run build`
- [ ] **App launches and shows 45 wallpapers in the selector**
- [ ] **Changing wallpaper, border, shadow persists on reload**
- [ ] **Panel resize persists on reload**
- [ ] **File picker remembers last directory**
- [ ] **Export remembers last directory**
