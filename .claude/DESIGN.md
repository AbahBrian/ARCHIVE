# Design System Specification: The Cinematic Archive

 

## 1. Overview & Creative North Star

The Creative North Star for this design system is **"The Cinematic Archive."**

 

Unlike standard utility apps that treat content as a list of files, this system treats a user’s YouTube library as a premium, curated gallery. We move away from the "template" look of traditional streaming interfaces by embracing an editorial layout—utilizing balanced white space, high-contrast typography, and a "soft-touch" layering philosophy. The goal is to make the interface feel like a high-end art book: clean, sophisticated, and deeply immersive.

 

## 2. Colors & Surface Philosophy

This system utilizes a warm, sophisticated palette that moves away from sterile whites into a "bone" and "linen" territory, providing a more premium feel than standard RGB white.

 

### The "No-Line" Rule

**Explicit Instruction:** Designers are prohibited from using 1px solid borders to define sections or separate content. Boundaries must be defined solely through background color shifts. For example, a `surface-container-low` section sitting on a `surface` background provides all the definition needed.

 

### Surface Hierarchy & Nesting

Treat the UI as a series of physical layers. We use tonal shifts to create "nested" depth:

- **Base Layer:** `surface` (#fff8f7) - The foundation of the application.

- **Sectional Layer:** `surface-container-low` (#fff0ef) - Used for grouping large content blocks.

- **Interactive Layer:** `surface-container-lowest` (#ffffff) - Reserved specifically for cards and interactive modules to make them "pop" against the warmer background.

 

### The "Glass & Gradient" Rule

To ensure the UI feels modern and fluid, use **Glassmorphism** for floating elements (like navigation bars or player overlays). Use semi-transparent surface colors with a `20px` to `40px` backdrop-blur.

 

**Signature Texture:** Use a subtle linear gradient for primary CTAs, transitioning from `primary` (#ba061b) to `primary-container` (#df2b31) at a 135-degree angle. This adds a "jewel-like" depth that a flat hex code cannot achieve.

 

---

 

## 3. Typography

We utilize **Manrope** for its geometric yet approachable character. It bridges the gap between technical precision and editorial elegance.

 

- **Display (lg, md, sm):** Used for "Hero" moments, such as total watch time or featured playlist titles. Use `tight` letter spacing (-0.02em) to create an authoritative, premium look.

- **Headlines:** Reserved for page titles. These should feel like magazine headers.

- **Body (lg, md):** Optimized for readability with a generous line height (1.6) to prevent the "wall of text" feel.

- **Labels:** Always uppercase with `+0.05em` letter spacing when used for metadata (e.g., VIDEO DURATION, CATEGORY) to differentiate from interactive text.

 

The hierarchy is designed to be "Top-Heavy," using large Display styles to anchor the page, followed by significantly smaller Body text to create a sophisticated, asymmetrical visual tension.

 

---

 

## 4. Elevation & Depth

Depth in this system is organic, not artificial. We mimic natural light and physical stacking.

 

### The Layering Principle

Depth is achieved by stacking surface tiers. Place a `surface-container-lowest` (#ffffff) card on a `surface-container-low` (#fff0ef) section. This creates a soft, natural lift without the "dirtiness" of heavy shadows.

 

### Ambient Shadows

When an element must float (e.g., a Modal or a FB), use **Ambient Shadows**:

- **Blur:** 32px to 48px.

- **Opacity:** 4%–8%.

- **Color:** Use a tinted version of `on-surface` (#281716) rather than pure black to ensure the shadow feels like it belongs to the environment.

 

### The "Ghost Border" Fallback

If a border is absolutely required for accessibility (e.g., an input field), use a **Ghost Border**: `outline-variant` (#e5bdb9) at **15% opacity**. Never use a 100% opaque border.

 

---

 

## 5. Components

 

### Cards & Lists

Cards are the heart of this system.

- **Style:** `surface-container-lowest` (#ffffff) with `md` (0.75rem) rounded corners.

- **Rule:** **Strictly forbid divider lines.** Use standard vertical white space (24px or 32px) to separate list items. Content should feel organized and structured.

 

### Buttons

- **Primary:** Gradient-filled (Primary to Primary-Container) with `full` rounding (pill-shape). High-contrast `on-primary` text.

- **Secondary:** Tonal. `surface-container-high` background with `primary` text.

- **Tertiary:** Text-only, using `primary` color, reserved for low-emphasis actions like "See More."

 

### Video Thumbnails

Thumbnails are the "Photography" of our editorial layout.

- **Corner Radius:** `md` (0.75rem).

- **Overlay:** Use a 20% bottom-to-top black gradient to ensure "Duration Labels" remain legible.

 

### Chips

Use for categories (e.g., "Music," "Unwatched," "History").

- **Selected:** `primary` background with `on-primary` text.

- **Unselected:** `surface-container-highest` with `on-surface-variant` text.

 

### Input Fields

Soft, pill-shaped (`full` roundedness) with a `surface-container-low` background. On focus, the background shifts to `surface-container-lowest` with a "Ghost Border" of `primary` at 20% opacity.

 

---

 

## 6. Do's and Don'ts

 

### Do

- **Do** use balanced white space. Maintain a clean, "normal" density that allows content to breathe without feeling sparse.

- **Do** use the `primary` red (#ba061b) as a precision tool—for progress bars, active states, and critical CTAs only.

- **Do** ensure all video thumbnails have a consistent aspect ratio (16:9) to maintain the grid's editorial integrity.

 

### Don't

- **Don't** use pure black (#000000) for text. Always use `on-surface` (#281716) for a softer, high-end feel.

- **Don't** use sharp corners. Everything must feel approachable and high-end, using the `DEFAULT` (0.5rem) as a minimum radius.

- **Don't** use "Drop Shadows" that are visible at a glance. If the user notices the shadow, it is too dark. It should feel like a "whisper" of depth.

- **Don't** use horizontal rules (` `) or dividers. If you need to separate content, use a background color shift or intentional spacing.