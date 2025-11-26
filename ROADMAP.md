# Roadmap

## Minor Tweaks

- [ ] Fix mesh generation of Russia (currently broken)

## Upcoming Features

- [ ] Add collision detection of pin and countries in 2D space using accelerated data structures for polygon data
- [ ] Create a callback for when a country is selected
- [ ] Country selection behavior (in separate file, using callback API):
  - Increase selected country's altitude
  - Show country name label
  - On deselection: reset altitude and hide label

## Completed

- [x] Country animation now off by default, toggleable with 'A' key
- [x] Removed mergedTubeBorders (and all tube border code, borderData loading)
- [x] Paths within paths are lakes - cutouts in geometry (similar to enclave handling)
