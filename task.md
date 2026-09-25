# TASK: Gift Guide page — Shopify hiring test (Dawn theme)

You are a senior Shopify theme developer. Implement a hiring-test page in this Dawn theme with production-quality code. I'll be graded on pixel-perfect accuracy vs. Figma, code structure, comments, and efficiency — "the devil is in the details."

## Environment & working method

- Shopify dev store, Dawn theme (latest, Online Store 2.0). This folder is the theme root; I run it with `shopify theme dev`.
- First explore the theme structure (`sections/`, `snippets/`, `assets/`, `templates/`, `config/settings_schema.json`) so you follow Dawn's conventions for schema, translations, and asset loading — but do NOT reuse Dawn's sections/components.
- Create the new files directly. Don't modify existing Dawn files except the existing page template mentioned below. Don't touch Git.
- Run `shopify theme check` at the end if available and fix any errors.
- Design references: Figma screenshots are in `./design/` (desktop, mobile, popup). Look at them before writing any CSS.

## Hard rules

1. NO jQuery — vanilla JavaScript only (ES6+).
2. Do NOT use or copy any ready-made Dawn sections/components (image-banner, featured-collection, product-card, quick-add, modal-opener, cart-drawer logic, etc.). Build 2 NEW sections from scratch.
3. Well-structured, commented, efficient code: CSS/JS loaded only inside the sections that use them, no global variable pollution, no unnecessary network requests.
4. Pixel perfect vs. Figma on desktop AND mobile.

## Page

The page template ALREADY EXISTS: `templates/[template-name]`. Do NOT create a new template. Open the existing one and update it so it contains exactly 2 custom sections in this order: Banner, Grid (remove any other sections in it). Keep the JSON valid and section IDs unique.

## Design tokens (from Figma; frame is 3840px wide → "1920" column = Figma ÷ 2)

| Element | Figma (3840 frame) | At 1920px | Use in CSS |
|---|---|---|---|
| Banner frame (incl. top bar + strip) | 3840 × 2340 | 1920 × 1170 | `aspect-ratio: 3840/2340` (height ≈ 61% of width); no fixed px height |
| Heading "The Gift Guide" | Jost Medium 164.78px, line-height 100%, letter-spacing 0, #000000, box 1080×165 | 82.4px | `font-size: clamp(48px, 4.29vw, 82.4px)` |
| Paragraph | Jost Regular 47.08px, line-height 140%, letter-spacing 0, #000000, left aligned, ~3 lines | 23.5px | `clamp(15px, 1.226vw, 23.5px)`; max-width ≈ 545px at 1920 (1090 in Figma) |
| SHOP NOW button | 517.89 × 117.7, bg #000000, text #FFFFFF, uppercase, long right arrow → | 259 × 59 | width 13.49vw / height 3.06vw (or padding-based, ratio 4.4:1), radius 0 |
| Top bar | bg #F5F5F5, height [__], "TISSO VISON" [size __, weight __, letter-spacing __], center text [size __] | | |
| CHOOSE GIFT button | bg #FFF544, text #000000, size [__ × __], uppercase, arrow → | | |
| Bottom strip | bg #F5F5F5, height [__]; text uppercase, centered, #000000, size [__], letter-spacing [__] | | |
| Grid container | 2844.3 wide (auto-layout wrap), gap 42.48 (row & column), padding 0, centered | 1422 wide, gap 21.24 | width 74.07% of page; gap 1.106vw (≈1.494% of grid width) |
| Grid tile | 919.78 × 943.14, image fill (cover), radius 0 | 460 × 471.6 | 3 columns; `aspect-ratio: 919.78 / 943.14` (≈0.975, slightly taller than square) |
| Hotspot circle | bg #F8F8F8 at 90% opacity, black "+" icon, size [__], shadow [__] | | position varies per tile (on the product) |
| Fonts | Jost for everything except the mobile grid heading "Tisso vison in the wild" which is a serif [__] | | Load Jost via Shopify's font library (`font_picker` setting, default `jost_n5` for headings / `jost_n4` for body, output with the `font_face` filter). No Google Fonts CDN. |
| Colors | #000000, #FFFFFF, #F5F5F5, #FFF544, #F8F8F8 | | CSS custom properties on the section wrapper |
| Breakpoint | mobile ≤ 749px (Dawn's breakpoint) unless the Figma mobile frame suggests otherwise | | |

Where a value is `[__]`, estimate it proportionally from the screenshots, expose it as a CSS variable, and list it under Assumptions at the end.

## Section 1 — Banner (`sections/custom-banner.liquid`)

### Desktop (see desktop screenshot)

- Top bar, full width, bg #F5F5F5: left "TISSO VISON" (uppercase, bold, letter-spaced); center "Find the ideal gift for your loved ones."; right yellow button "CHOOSE GIFT →".
- Hero: full-width black & white line-art illustration as background image (`image_picker` setting). Content block bottom-left: heading "The Gift Guide", paragraph "Discover Joy: Your Ultimate Holiday Gift Destination. Explore our curated selection and find the perfect gifts to delight your loved ones this holiday season.", black "SHOP NOW →" button.
- Bottom strip, full width, bg #F5F5F5: centered uppercase text "SUSTAINABLE, ETHICALLY MADE CLOTHES IN SIZES XXS TO 6XL".

### Mobile (see mobile screenshot — different structure, not just scaled)

- Top bar: hamburger icon left, "TISSO VISON" centered; center text and CHOOSE GIFT hidden.
- Heading centered on white background above the image.
- Paragraph is SHORTER: "Discover Joy: Your Ultimate Holiday Gift Destination." (centered).
- Illustration image BELOW the text (separate mobile image setting; crop differs).
- "SHOP NOW →" overlaid on the lower-center of the image.
- Strip text is DIFFERENT: "SUSTAINABLE, ETHICALLY MADE ACTIVEWEAR".

### Customizer settings (ALL text must be editable)

brand text; top bar text; CHOOSE GIFT label + link; heading; desktop paragraph; mobile paragraph; SHOP NOW label + link; desktop strip text; mobile strip text; desktop image; mobile image; colors (top bar bg, CHOOSE GIFT bg, strip bg, button bg/text) with defaults from the token table. Add presets and defaults matching the text above.

### Button animation

On hover for both buttons: [__ describe the Figma prototype; if unknown: arrow slides right ~6px and background/text colors invert with a 0.3s ease]. CSS transitions/transform only; respect `prefers-reduced-motion`.

### Top bar decision

The Figma top bar looks like a header. Build it INSIDE the banner section (fully custom, editable). Recommend whether to hide Dawn's default header/footer on this template only (custom layout file vs template-scoped approach), explain the trade-off, and implement your recommendation with a setting toggle.

## Section 2 — Grid (`sections/custom-product-grid.liquid`)

### Layout

- Optional heading: mobile shows a centered serif "Tisso vison in the wild"; the desktop screenshot shows empty space instead. Heading text setting + checkbox "Show heading on desktop" (default off). Flag as an assumption.
- Desktop: 3 columns × 2 rows, container 74.07% of page width centered, gap 1.106vw (21.24px at 1920), tiles `aspect-ratio: 919.78/943.14`, images `object-fit: cover`.
- Mobile: 2 columns × 3 rows, near full width, small gap [__].

### Blocks

Block type `product`, `max_blocks: 6`, settings:

- `product` (product picker)
- `image` override (`image_picker`; the design uses lifestyle photos — fall back to product featured image)
- `hotspot_x` and `hotspot_y` range sliders 0–100 % (the "+" circle sits on the product in each photo at a different spot)

Hotspot markup: `<button>` with `aria-label="Quick view {{ product.title }}"`, circle bg #F8F8F8 at 90% opacity, black "+".
Empty block (no product) shows a placeholder in the editor without breaking the grid.

## Popup (quick view)

Design: see popup screenshot in `./design/` — [describe: image position, title, price, description, variant UI (color swatches / size dropdown), ADD TO CART style, close icon]. If no popup screenshot is provided, use a clean centered modal: image left, details right, matching the Jost typography and black/white palette; stack on mobile.

Requirements:

- Clicking a hotspot opens the popup with product name, price, description, and variant options.
- Variant options rendered DYNAMICALLY from product data (loop options/variants; nothing hardcoded; any number of options).
- Selecting options updates the selected variant and price; disable/indicate unavailable and sold-out combinations ("Sold out" on the button).
- "ADD TO CART" via `fetch` POST `/cart/add.js` with loading state, success/error feedback, and update Dawn's header cart count bubble (Section Rendering API or `/cart.js` — justify your choice).
- Close on close button, overlay click, ESC. Lock body scroll while open. `role="dialog"`, `aria-modal="true"`, focus moves into the popup and returns to the trigger on close.
- Efficiency: ONE popup element in the DOM, populated with the clicked product's data. Embed product JSON per block in `<script type="application/json">` OR fetch `/products/{handle}.js` on click — recommend one and justify it.
- Mobile: popup fits the screen, scrollable if content overflows.

## Business rule (IMPORTANT)

When ANY product is added with a variant whose options include both "Black" AND "Medium", also add the product "Soft Winter Jacket".

- Soft Winter Jacket = a `product` setting in the grid section (no hardcoded handle/ID), commented.
- Add both items in ONE `/cart/add.js` request (`items` array).
- Match option values case-insensitively and regardless of option name/order.
- Don't auto-add if the product being added IS the Soft Winter Jacket. If the jacket is sold out or not set, skip it gracefully and still add the main product.

## Files

- `sections/custom-banner.liquid`
- `sections/custom-product-grid.liquid`
- `snippets/product-popup.liquid` (single popup markup)
- `assets/custom-banner.css`, `assets/custom-grid.css`, `assets/custom-popup.js`
- JS as a custom element (e.g. `<product-popup>`) with commented methods: `open()`, `close()`, `renderVariants()`, `updateSelectedVariant()`, `addToCart()`, `shouldAddUpsell()`. Files loaded only inside their sections (`stylesheet_tag` / `script` with `defer`).
