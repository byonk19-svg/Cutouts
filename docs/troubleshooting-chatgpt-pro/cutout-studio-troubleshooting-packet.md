# Cutout Studio Troubleshooting Packet

Generated: 2026-07-04

This packet captures the working context, conversation decisions, app state, and screenshots from the Cutout Studio troubleshooting session. It is meant to be pasted into or uploaded to ChatGPT Pro so the next troubleshooting pass has the same context.

## Project Snapshot

- Project folder: `C:\Users\byonk\OneDrive\Documents\Cutouts`
- Local app URL during testing: `http://127.0.0.1:5173/`
- Backend URL during testing: `http://127.0.0.1:8787/`
- App name: `Cutout Studio`
- Purpose: turn an uploaded character/image into printable wood cutout tracing pages plus a craft paint color guide.
- Current user goal: personal workflow first, with possible future Etsy template selling.
- Current unresolved issue: get useful inside tracing lines without unwanted gray shading/texture contours, especially in hair, clothing, and boots.

## Latest Commits

```text
4a7ddf4 Darken interior tracing strokes
17d56ca Suppress shading contours in detail tracing
0050d0f Use thin paint-region tracing lines
1e8b7ab Simplify template settings workflow
37f0711 Preserve paint-region detail lines
41292b4 Add detail cleanup control for noisy templates
2a97c2c Harden upload parsing and close print pipeline issue
9e1031d Build cutout template generator v1
```

## Current Git Status Before Packet

```text
?? docs/troubleshooting-chatgpt-pro/
```

## How To Run The App

1. Open PowerShell in `C:\Users\byonk\OneDrive\Documents\Cutouts`.
2. Start the backend: `py -m uvicorn backend.cutout_studio.server:app --host 127.0.0.1 --port 8787`
3. Start the frontend: `npm run dev -- --host 127.0.0.1 --port 5173`
4. Open `http://127.0.0.1:5173/`.

## Important Files

- `src/main.tsx`: React UI, settings controls, export behavior.
- `src/styles.css`: app styling.
- `backend/cutout_studio/pipeline.py`: image processing, tracing, paint palette extraction, PDF layout data.
- `backend/cutout_studio/server.py`: FastAPI endpoints.
- `backend/cutout_studio/craft_paint_catalog.json`: craft paint suggestions.
- `README.md`: run instructions.
- `CONTEXT.md`: project context and decisions.

## Conversation Reconstruction

### Initial Product Direction

The user makes wood yard cutouts from Etsy templates: stencil onto wood, cut with a jigsaw, paint, and seal. The desired program should take an image, create a printable template, and match image colors to affordable craft paint colors available from places like Hobby Lobby.

The user repeatedly confirmed the key scope decisions:

- Personal workflow first.
- Use popular, relatively cheap craft paint brands.
- Generate tiled printouts at a finished height in inches.
- Include a paint color guide.
- Make the result usable for tracing and cutting wood.
- Use the bought Etsy PDFs as references for what works well.

### First Working Version

A local web app was built. It accepted an uploaded image, generated a trace preview, exported a multi-page PDF, and listed paint colors. The first preview had a strong outer cut line but the interior detail was mainly gray texture/noise rather than clean traceable paint-region lines.

### Interior Detail Problem

The user said: `i need the detail on the inside for tracing`. A detail cleanup control was added, but it exposed too many technical settings and the user said the settings were confusing and still not right.

### Simplified Settings

The UI was simplified from many technical sliders into three trace styles:

- `Cut outline`: outer shape only.
- `Paint tracing`: clean inside lines.
- `More detail`: shows smaller lines.

The app kept a few understandable controls like finished height, line smoothness, inside detail, and paint colors.

### Gray Shading Problem

The user said they were still having trouble getting good inside lines without gray shading on the hair and other areas. The pipeline was adjusted so paint tracing used paint-region boundaries and suppressed many texture contours. This improved the output but there were still tradeoffs:

- Too little detail loses useful facial/clothing boundaries.
- Too much detail brings back shading, texture, and hair noise.
- Automatically deciding which inside lines are artistically useful is hard from one image alone.

### Current Best State

The final screenshots show a cleaner result: stronger black outer outline, darker gray interior lines, fewer hair texture contours, and more readable paint-region boundaries. It is closer to usable, but the next likely feature should be manual cleanup: allow the user to erase unwanted inside lines and draw missing lines before exporting.

## Current Recommendation For Next Troubleshooting Pass

The next best feature is probably an edit step between preview and PDF export:

1. Generate the automatic cut outline and paint tracing.
2. Let the user erase unwanted interior lines with a brush.
3. Let the user draw missing interior lines.
4. Keep the outer cut outline locked so it cannot be accidentally damaged.
5. Export the edited tracing to the tiled PDF.

This matches the real craft workflow better than trying to make one automatic slider perfect for every image.

## Screenshots

### Screenshot 1: Initial setup screen after image upload.

![Initial setup screen after image upload.](images/01-initial-settings-top.png)

### Screenshot 2: Initial slider controls and preview footer.

![Initial slider controls and preview footer.](images/02-initial-settings-bottom.png)

### Screenshot 3: Early preview with outer outline plus gray interior texture.

![Early preview with outer outline plus gray interior texture.](images/03-initial-preview-head.png)

### Screenshot 4: Lower body and boots from early preview.

![Lower body and boots from early preview.](images/04-initial-preview-lower.png)

### Screenshot 5: Color guide with craft paint suggestions.

![Color guide with craft paint suggestions.](images/05-color-guide.png)

### Screenshot 6: Preview where interior details disappeared too much.

![Preview where interior details disappeared too much.](images/06-outline-only-preview.png)

### Screenshot 7: Settings showing detail cleanup control.

![Settings showing detail cleanup control.](images/07-settings-detail-cleanup.png)

### Screenshot 8: Older slider-heavy settings that felt confusing.

![Older slider-heavy settings that felt confusing.](images/08-confusing-settings-top.png)

### Screenshot 9: Preview after confusing settings, head area.

![Preview after confusing settings, head area.](images/09-confusing-settings-preview-head.png)

### Screenshot 10: Preview after confusing settings, body area.

![Preview after confusing settings, body area.](images/10-confusing-settings-preview-mid.png)

### Screenshot 11: Preview after confusing settings, lower body.

![Preview after confusing settings, lower body.](images/11-confusing-settings-preview-lower.png)

### Screenshot 12: Color guide after settings revisions.

![Color guide after settings revisions.](images/12-color-guide-after-settings.png)

### Screenshot 13: Simplified trace style controls.

![Simplified trace style controls.](images/13-simplified-settings.png)

### Screenshot 14: Paint tracing with too many contour/shading lines in hair and face.

![Paint tracing with too many contour/shading lines in hair and face.](images/14-too-much-contour-head.png)

### Screenshot 15: Paint tracing with too many small contour lines in clothes and boots.

![Paint tracing with too many small contour lines in clothes and boots.](images/15-too-much-contour-lower.png)

### Screenshot 16: Cleaner settings after suppressing shading contours.

![Cleaner settings after suppressing shading contours.](images/16-cleaner-settings.png)

### Screenshot 17: Cleaner head preview with fewer unwanted shading lines.

![Cleaner head preview with fewer unwanted shading lines.](images/17-cleaner-preview-head.png)

### Screenshot 18: Cleaner lower preview with interior tracing still light.

![Cleaner lower preview with interior tracing still light.](images/18-cleaner-preview-lower.png)

### Screenshot 19: Final settings shown by user.

![Final settings shown by user.](images/19-final-settings.png)

### Screenshot 20: Final preview head, darker interior lines and less hair shading.

![Final preview head, darker interior lines and less hair shading.](images/20-final-preview-head.png)

### Screenshot 21: Final preview body, darker interior paint-region lines.

![Final preview body, darker interior paint-region lines.](images/21-final-preview-body.png)

### Screenshot 22: Final preview lower body and boots plus color guide start.

![Final preview lower body and boots plus color guide start.](images/22-final-preview-boots.png)

## Reference PDFs Mentioned

- `C:\Users\byonk\Downloads\MaxEasyMakeCharacters.pdf`
- `C:\Users\byonk\Downloads\YukonC..pdf`

## Prompt To Use In ChatGPT Pro

I am building a local app called Cutout Studio. It takes a character/image and makes a printable wood cutout template for tracing, cutting, and painting. The hard part is generating useful interior tracing lines without including gray shading/noise from hair, clothing, and image texture. Based on this packet and screenshots, help me decide the next implementation step. I suspect I need manual edit mode where I can erase unwanted interior lines and draw missing ones before exporting the tiled PDF. Please review the screenshots and recommend the simplest robust workflow and implementation approach.
