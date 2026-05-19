# Wallpapers Expansion + Auto-Save Preferences

## Summary

Two changes to Openscreen:
1. Import all Recordly wallpapers, renaming to numbered scheme (`wallpaper19.jpg` onwards)
2. Extend `userPreferences.ts` to persist additional settings across sessions

## 1. Wallpapers Expansion

### Current State
- 18 wallpapers: `wallpaper1.jpg` - `wallpaper18.jpg`
- `WALLPAPER_COUNT = 18` in `src/lib/wallpaper.ts`
- Served from `public/wallpapers/`

### Target State
- Copy unique Recordly wallpapers from `/Applications/Recordly.app/Contents/Resources/assets/wallpapers/` into `public/wallpapers/`
- Rename to `wallpaper19.jpg`, `wallpaper20.jpg`, ... (skip duplicates already in wallpaper1-18)
- Update `WALLPAPER_COUNT` to new total
- No other code changes needed — `WALLPAPER_PATHS` is derived from the count

### Deduplication
- Compare Recordly's numbered files (wallpaper1-15) against existing Openscreen wallpaper1-18 by file hash
- Only copy files that are genuinely new

## 2. Auto-Save Preferences

### New Fields in `UserPreferences`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `backgroundIndex` | `number` | `0` | Index into `WALLPAPER_PATHS` |
| `borderRadius` | `number` | current default | Border roundness in px |
| `shadow` | `string` | current default | Shadow CSS value or preset name |
| `lastOpenedDirectory` | `string \| null` | `null` | Last dir used for video file picker |
| `lastExportDirectory` | `string \| null` | `null` | Last dir used for export |
| `panelHeight` | `number` | `63.7` | Vertical panel split percentage |

### Validation Rules
- `backgroundIndex`: integer, 0 <= n < WALLPAPER_COUNT
- `borderRadius`: number, 0 <= n <= max (e.g., 50)
- `shadow`: string, non-empty or use default
- `lastOpenedDirectory`: string or null (no validation beyond type — OS handles invalid paths)
- `lastExportDirectory`: string or null
- `panelHeight`: number, 40 <= n <= 70 (matches panel min/max constraints)

### Integration Points
- **Background selector component**: call `saveUserPreferences({ backgroundIndex })` on change; read on mount
- **Border/shadow controls**: call save on change; read on mount
- **File picker (open)**: after user picks a file, save the directory portion
- **Export dialog**: after user picks export path, save the directory
- **Panel resize handle**: save `panelHeight` on resize end (`onLayout` callback from react-resizable-panels)
- **App initialization**: `loadUserPreferences()` already runs; consumers read from it

### Backward Compatibility
- Existing saved prefs (padding, aspectRatio, exportQuality, exportFormat) remain unchanged
- New fields default gracefully when missing from stored JSON — `loadUserPreferences()` already handles this pattern
