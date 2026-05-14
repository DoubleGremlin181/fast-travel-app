# Fast Travel — brand assets

Source of truth for the Chevron mark, lockups, and derived icons.

## Palette

| Token | Hex       | Use                                         |
|-------|-----------|---------------------------------------------|
| Night | `#0E1020` | Primary brand color, dark backgrounds, text |
| Ink   | `#1A1D2E` | Secondary dark surface                      |
| Paper | `#F5F2EC` | Primary light background                    |
| Bone  | `#ECE7DC` | Warmer paper tint for chrome                |
| Flare | `#3E6098` | Denim accent — leading chevron only         |
| Fog   | `#C8C3BA` | Neutral border / disabled                   |
| Slate | `#4A4E63` | Muted text on paper                         |

## Files

- `chevron.svg` — the mark (standard geometry: stroke 22 / pad 52)
- `chevron-favicon.svg` — thickened for ≤32 px (stroke 28 / pad 42)
- `icon-on-night.svg` — full tile: Night squircle + Paper + Denim chevron
- `icon-on-paper.svg` — full tile: Paper squircle + Night + Denim chevron
- `icon-android-flare.svg` — Denim square, used for alt Android adaptive
- `generate-icons.mjs` — rasterizes SVGs to the PNG sizes needed by
  extension + Android (requires ImageMagick `magick`)

## Mark geometry

```
viewBox       0 0 200 200
back chevron  52,60 → 97,100 → 52,140      (fill color)
front chevron 103,60 → 148,100 → 103,140   (accent color — Denim)
stroke        width 22 · square cap · miter join
gap           6 between the two chevrons
```

Don't rotate, stretch, round the caps, or retint off-brand. See sheet 08 of
the brand kit.
