# Leeway · Embroidery Studio

A small browser tool for designing embroidery for the Leeway t-shirt (Stanley/Stella **Blaster 2.0**, Mocha, size M) and getting clean, true-size files into Ember for digitising into `.dst`.

**To open it:** double-click `index.html`. It runs in Chrome or Safari with no install, server or internet. Everything stays on your computer.

## The three tools

### 1 · Mockup
- **Front / Back** switch (top left of the toolbar). Each side has its own layers and hoop position. The back view is made from the product photo with the front neckline replaced by a back collar band (`tools/make_back_photo.py`).
- **Photo** (right panel → Shirt):
  - *Fitted to size guide* (default): the photo warped so chest = **67 cm**, length = **75 cm**, sleeve = **24.5 cm** (size M). Everything is to scale.
  - *Original photo (un-stretched)*: the product photo as it is. It can't match both chest and length at once, so you choose what to scale it on (body length 75 cm or chest 67 cm); the note underneath says what the other dimension reads.
- **📏 Measure** (or press **M**): drag between any two points to get the distance in cm (plus horizontal/vertical parts). Ends snap to design corners, edge midpoints and centres, the hoop, the neckline and the hem; hold **Shift** for straight / 45° lines. Measurements stay until *Clear measures*; Esc leaves measure mode. *Size guide* shows chest / length / sleeve lines.
- **Designs** from `designs/` are on the left; drop more SVGs onto the panel or the shirt. Illustrator artboards import at real size (1 pt = 0.353 mm).
- **Layers**: click a design to add it. Drag to move, corner handle to resize, ◦ handle to rotate (Shift = 15° steps), ▲▼ to stack on top of each other, pick a thread colour, or type exact cm values. *Placement* presets change with the side (front: centre/left/right chest, lower front, sleeve · back: back neck, upper back, centre back, lower back, sleeve).
- **White areas** in a design can be knock-outs (show the fabric), ignored, or stitched in white.
- **Hoops**: **10 × 10** or **10 × 23.5** (portrait / landscape). Drag the frame to move it. The status turns red when a layer crosses the edge, and warns if anything is bigger than the largest hoop.
- **Exports**: **Hoop → SVG for Ember** (all layers inside the hoop on the current side, in mm, positioned in the field: 100 × 100 or 100 × 235 mm; each layer is a group named after the design with its thread colour in `data-thread`), **PNG** mockup of the current side, and under *More*: selected layer as true-size SVG, save / open project (.json), clear.
- Shortcuts: arrows nudge 1 mm (Shift = 1 cm), ⌘Z / ⇧⌘Z undo/redo, ⌘D duplicate, Delete removes, M measure, Space + drag or wheel to pan / zoom.

### 2 · Image → ASCII / Pixel
Drop, choose or paste an image. Set the hoop and width in mm, then adjust brightness, contrast, gamma, background cut, auto levels and invert.
- **ASCII**
  - *Density* uses a ramp of characters. *Line art* follows the edges with `_ - | / \ "` (the mushroom-sketch look). *Both* mixes the two.
  - **Single-line stroke** output (the default) draws every character as a run-stitch path from a built-in font, so Ember needs no fonts and nothing has to be outlined. *Text* output uses a monospace font instead; you would need to outline it first.
  - You can also copy the ASCII as text or save it as `.txt`.
- **Pixel**
  - pixel size in mm, with dithering (Floyd–Steinberg, Atkinson, Bayer)
  - *Darkest* sampling keeps thin lines
  - styles: solid blocks (merged into clean outlines), **outline** (the stair-step line look), tiles, dots, cross-stitch ×
- The tool warns when characters or pixels get too small to stitch well.
- **SVG (mm)** saves at true size. **PNG** is 300 dpi black on white, for auto-digitising. **Add to mockup →** puts the result straight on the shirt.

### 3 · Draw
A canvas the size of the hoop field, in mm.
- **Line**: smooth vector strokes. You set the width and smoothing.
- **Pixel line**: a single line that only moves in pixel steps, so curves become staircases (the outline look from the “%” reference). Set the step size and line width; *Allow 45° steps* gives a softer diagonal. Exports as one run-stitch path.
- **Pixel**: paints on a grid. You set the cell size and brush size.
- **ASCII**: stamps characters along your stroke.
  - *Auto* picks `- | / \ _` from the direction you draw.
  - You can also repeat a word, use a single character, or pick at random from a set.
  - *Snap to text grid* keeps everything on a monospace grid, like real ASCII art.
- **Eraser**, **Measure** (drag to read mm / cm, Shift = straight), undo/redo, and *Trace image…* to draw over a photo.
- Keys: L line · S pixel line · P pixel fill · A ASCII · E eraser · M measure.
- Export an SVG at the hoop size in mm (positions match the hoop), a PNG at 300 dpi, or send it to the mockup.

## Getting files into Ember
1. Export an SVG: *Hoop → SVG for Ember*, or *SVG (mm)* from the other tabs. Sizes are real millimetres.
2. In Ember, import the SVG and check the size against the hoop. It should already match.
3. Lines (strokes) suit run or bean stitch, or satin if they are wide. Filled shapes suit fill or tatami. The pixel *outline* and ASCII *stroke* styles are pure single lines, the easiest to digitise cleanly.
4. Fonts in **Artboard 1** (PP Mori) and **Artboard 2** (Comic Sans) are live text. Use *Type → Create Outlines* in Illustrator before digitising.
5. Rough limits that work well:
   - characters ≥ 3.5 mm tall
   - fill pixels ≥ 2.5 mm
   - run-stitch details ≥ 1 mm apart
   - test on a scrap of the same 200 gsm jersey with stabiliser

## Adding new designs permanently
Put the `.svg` files in `designs/`, then run:

```sh
node scripts/build-designs.mjs
# or copy straight from the Leeway folder:
node scripts/build-designs.mjs ~/Desktop/Leeway/Designs
```

This rebuilds `designs/designs.js`. Designs you import in the browser, or make in the converter or the canvas, are also kept in that browser's storage.

## Files
```
index.html            the app
css/style.css
js/core.js            shared helpers, SVG normaliser, colour palettes, hoops, contour tracing
js/strokefont.js      single-line monospace font for ASCII
js/mockup.js          mockup studio
js/convert.js         image → ASCII / pixel
js/draw.js            drawing canvas
assets/shirt.js       front/back × fitted/original shirt images (bundled so it works offline)
assets/shirt-*-original.png  source photos (back is generated from the front)
designs/              your SVGs + generated designs.js bundle
scripts/build-designs.mjs
tools/make_back_photo.py    builds the back view from the front photo
tools/build_shirt_assets.py fits the photos to the size guide and rebuilds assets/shirt.js
```

Thread colours are close screen matches. Check them against your real thread chart.
