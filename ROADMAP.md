# Roadmap

## Upcoming Features

- [ ] Pin should scale down according to current camera zoom
- [ ] Treeshaking of Babylon.js to make build smaller
- [ ] Right mouse button on globe enters placing mode, release exits

## Completed

- [x] Country animation now off by default, toggleable with 'A' key
- [x] Removed mergedTubeBorders (and all tube border code, borderData loading)
- [x] Paths within paths are lakes - cutouts in geometry (similar to enclave handling)
- [x] Fix mesh generation of Russia (using CDT triangulation with Steiner points)
- [x] Fix missing Switzerland/Germany border (reduced MIN_SEGMENT_LENGTH from 3 to 2, increased EPSILON from 0.0001 to 0.002 for data inconsistencies)
- [x] Add collision detection of pin and countries in 2D space using grid-based spatial index (CountryPicker)
- [x] Create a callback for when a country is selected (setCountrySelectedCallback API)
- [x] Country selection behavior: Show country name label on selection (CountrySelectionBehavior)
- [x] Country selection behavior: Animate altitude increase on selection
