# Roadmap

## Upcoming Features

- [ ] Small countries should have markers so they are easier to see
- [ ] Small countries should have a special look
- [ ] Low-res colliders that are easier to hit
- [ ] When scrolling on the earth with the pin on the edge, rotate the earth

## Completed

- [x] Pin scales based on camera zoom distance (smaller when close, larger when far)
- [x] Right mouse button on globe enters placing mode, release exits
- [x] Tree-shaking Babylon.js (bundle reduced from ~11.7 MB to ~1.9 MB, inspector loaded dynamically)

- [x] Country animation now off by default, toggleable with 'A' key
- [x] Removed mergedTubeBorders (and all tube border code, borderData loading)
- [x] Paths within paths are lakes - cutouts in geometry (similar to enclave handling)
- [x] Fix mesh generation of Russia (using CDT triangulation with Steiner points)
- [x] Fix missing Switzerland/Germany border (reduced MIN_SEGMENT_LENGTH from 3 to 2, increased EPSILON from 0.0001 to 0.002 for data inconsistencies)
- [x] Add collision detection of pin and countries in 2D space using grid-based spatial index (CountryPicker)
- [x] Create a callback for when a country is selected (setCountrySelectedCallback API)
- [x] Country selection behavior: Show country name label on selection (CountrySelectionBehavior)
- [x] Country selection behavior: Animate altitude increase on selection
