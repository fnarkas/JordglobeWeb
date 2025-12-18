# EarthGlobe Features for Multiplayer

## Overview

This document outlines specific features needed in `EarthGlobe` and related classes to support multiplayer gameplay. These features can be developed and tested independently before integrating with the full multiplayer system.

---

## Feature 1: Multi-Pin Support

### Current State
`PinManager` supports:
- Single preview pin
- Single placed pin at a time
- Callbacks for single pin placement

### Needed for Multiplayer
Display multiple pins simultaneously (one per player)

### Implementation Plan

#### New Class: `MultiPinManager`
Extends/replaces `PinManager` to handle multiple pins

```typescript
interface PlayerPin {
  playerId: string;
  playerName: string;
  color: string;
  position: { lat: number; lon: number };
  mesh: TransformNode;
}

class MultiPinManager {
  private pins: Map<string, PlayerPin>;

  // Add a pin for a player
  addPin(playerId: string, name: string, color: string, lat: number, lon: number): void;

  // Remove a pin
  removePin(playerId: string): void;

  // Update pin position
  updatePin(playerId: string, lat: number, lon: number): void;

  // Clear all pins
  clearAllPins(): void;

  // Show/hide all pins
  setVisible(visible: boolean): void;
}
```

#### Key Changes
1. **Pin colors**: Support 8 unique colors for players
2. **Pin labels**: Show player name above each pin
3. **Pin management**: Track multiple pin instances
4. **No preview mode**: Pins appear directly (no hover preview)

#### Testing Independently
```typescript
// Test script
const multiPinManager = new MultiPinManager(scene, camera, earthSphere, createUnlitMaterial);

// Simulate 4 players answering
multiPinManager.addPin('p1', 'Alice', '#FF0000', 48.8584, 2.2945);  // Paris
multiPinManager.addPin('p2', 'Bob', '#00FF00', 51.5074, -0.1278);   // London
multiPinManager.addPin('p3', 'Charlie', '#0000FF', 40.7128, -74.0060); // NYC
multiPinManager.addPin('p4', 'Diana', '#FFFF00', 35.6762, 139.6503);   // Tokyo

// Clear after testing
setTimeout(() => multiPinManager.clearAllPins(), 5000);
```

---

## Feature 2: Arc Drawing System

### Purpose
Draw animated geodesic arcs from player answers to correct location

### Visual Goal
```
Player Pin A ---------> Correct Answer
Player Pin B ------>
Player Pin C ---------------->
```

### Implementation Plan

#### New Class: `ArcDrawer`
```typescript
interface Arc {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  altitude: number; // Start and end of the arc is att surface level, but then goes above the surface to the middle of the arc
  color: string;
  progress: number; // 0 to 1
}

class ArcDrawer {
  private arcs: Arc[];

  // Add an arc
  addArc(startLat: number, startLon: number, endLat: number, endLon: number, color: string): void;

  // Animate all arcs from 0% to 100%
  animateArcs(duration: number): Promise<void>;

  // Clear all arcs
  clearArcs(): void;
}
```

#### Technical Approach
1. **Geodesic calculation**: Calculate points along great circle path
2. **Babylon.js Lines**: Use `CreateLines` or `CreateTube` for rendering
3. **Animation**: Update line geometry each frame during animation
4. **Performance**: Pre-calculate all arc points before animating
5. **Performance**: allocate all data needed during loading and pool the usage

#### Arc Calculation
```typescript
// Calculate N points along great circle from (lat1, lon1) to (lat2, lon2)
function calculateGeodesicPoints(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  numPoints: number
): Vector3[] {
  // Use spherical interpolation (slerp)
  // Return array of Vector3 positions on globe surface
}
```

#### Testing Independently
```typescript
const arcDrawer = new ArcDrawer(scene, EARTH_RADIUS);

// Draw arcs from various locations to Paris
arcDrawer.addArc(40.7128, -74.0060, 48.8584, 2.2945, '#FF0000');  // NYC → Paris
arcDrawer.addArc(35.6762, 139.6503, 48.8584, 2.2945, '#00FF00');  // Tokyo → Paris
arcDrawer.addArc(-33.8688, 151.2093, 48.8584, 2.2945, '#0000FF'); // Sydney → Paris

// Animate over 2 seconds
await arcDrawer.animateArcs(2000);
```

---

## Feature 3: Distance Display Labels

### Purpose
Show distance from each player's answer to correct location

### Visual Goal
```
   1,234 km
     ↓
   [Pin A]

   5,678 km
     ↓
   [Pin B]
```

### Implementation Plan

#### New Class: `DistanceLabelManager`
```typescript
interface DistanceLabel {
  playerId: string;
  position: { lat: number; lon: number };
  distance: number; // in km
  label: TextBlock; // Babylon.js GUI element
}

class DistanceLabelManager {
  // Add a distance label above a pin
  addLabel(playerId: string, lat: number, lon: number, distance: number): void;

  // Animate counter from 0 to actual distance
  animateLabel(playerId: string, duration: number): Promise<void>;

  // Remove label
  removeLabel(playerId: string): void;

  // Clear all labels
  clearAllLabels(): void;
}
```

#### Key Features
1. **3D positioning**: Label follows pin position (always above pin)
2. **Number animation**: Count up from 0 to actual distance
3. **Formatting**: "1,234 km" with comma separators
4. **Color coding**: Green (close) → Yellow (medium) → Red (far)

#### Testing Independently
```typescript
const labelManager = new DistanceLabelManager(scene, advancedTexture);

// Add labels for different distances
labelManager.addLabel('p1', 48.8584, 2.2945, 0);      // Perfect!
labelManager.addLabel('p2', 51.5074, -0.1278, 344);   // Close
labelManager.addLabel('p3', 40.7128, -74.0060, 5837); // Far

// Animate counters
await labelManager.animateLabel('p1', 1000);
await labelManager.animateLabel('p2', 1000);
await labelManager.animateLabel('p3', 1000);
```

---

## Feature 4: Highlighted Correct Location

### Purpose
Show the correct answer location with a special marker

### Visual Goal
```
    ⭐ (glowing star or special pin)
   Correct Answer
```

### Implementation Plan

#### New Method: `showCorrectLocation()`
Add to `EarthGlobe` or create new `CorrectLocationMarker` class

```typescript
class CorrectLocationMarker {
  private marker: TransformNode | null;

  // Show special marker at correct location
  show(lat: number, lon: number): void;

  // Hide marker
  hide(): void;

  startPulseAnimation(): void;
}
```

#### Visual Style Options
1. **Gold star mesh** (different from player pins)
2. **Pulsing glow effect**
3. **Label**: "Correct Answer" text above it
4. **Higher altitude**: Slightly above player pins for visibility

#### Testing Independently
```typescript
const correctMarker = new CorrectLocationMarker(scene, createUnlitMaterial);

// Show correct location for Eiffel Tower
correctMarker.show(48.8584, 2.2945);
correctMarker.startPulseAnimation();

// Hide after 5 seconds
setTimeout(() => correctMarker.hide(), 5000);
```

---

## Feature 5: Camera Animation

### Purpose
Smoothly move camera to frame all pins + correct answer

### Use Case
When revealing answers, automatically position camera so all relevant pins are visible

### Implementation Plan

#### New Method: `animateCameraToFrame()`
Add to `EarthGlobe` class

```typescript
class EarthGlobe {
  // Calculate best camera position to see all given lat/lon points
  animateCameraToFrame(
    locations: { lat: number; lon: number }[],
    duration: number = 1500
  ): Promise<void>;

  // Reset camera to default view
  resetCamera(duration: number = 1000): Promise<void>;
}
```

#### Technical Approach
1. **Calculate centroid**: Find center point of all locations
2. **Calculate radius**: Find distance to farthest point
3. **Set camera target**: Point camera at centroid
4. **Set camera distance**: Far enough to see all points
5. **Animate smoothly**: Interpolate from current to target

#### Testing Independently
```typescript
const globe = new EarthGlobe();

// Frame these locations
const locations = [
  { lat: 48.8584, lon: 2.2945 },   // Paris
  { lat: 40.7128, lon: -74.0060 }, // NYC
  { lat: 35.6762, lon: 139.6503 }  // Tokyo
];

await globe.animateCameraToFrame(locations, 2000);

// Reset after viewing
setTimeout(async () => {
  await globe.resetCamera(1000);
}, 5000);
```

---

## Feature 6: Player Color Palette

### Purpose
Consistent, distinguishable colors for 8 players

### Implementation

#### Shared Constants: `playerColors.ts`
```typescript
export const PLAYER_COLORS = [
  '#FF4444', // Red
  '#44FF44', // Green
  '#4444FF', // Blue
  '#FFFF44', // Yellow
  '#FF44FF', // Magenta
  '#44FFFF', // Cyan
  '#FF8844', // Orange
  '#8844FF', // Purple
];

export function getPlayerColor(playerIndex: number): string {
  return PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
}

// Color-blind friendly alternative
export const PLAYER_COLORS_ACCESSIBLE = [
  '#E69F00', // Orange
  '#56B4E9', // Sky Blue
  '#009E73', // Bluish Green
  '#F0E442', // Yellow
  '#0072B2', // Blue
  '#D55E00', // Vermillion
  '#CC79A7', // Reddish Purple
  '#999999', // Gray
];
```

#### Usage
```typescript
// Assign colors when players join
const playerColor = getPlayerColor(playerIndex);
multiPinManager.addPin(playerId, playerName, playerColor, lat, lon);
```

---


## Testing Strategy

### Individual Feature Tests

Create test HTML pages for each feature:

```
tests/
├── test-multi-pin.html
├── test-arcs.html
├── test-distance-labels.html
├── test-correct-marker.html
├── test-camera-animation.html
└── test-touch-controls.html
```

Each test:
1. Loads minimal dependencies
2. Creates `EarthGlobe` instance
3. Tests feature in isolation
4. Provides visual confirmation

### Integration Test

`tests/test-reveal-sequence.html`:
1. Show multiple player pins
2. Show correct location marker
3. Draw arcs to correct location
4. Animate distance labels
5. Frame camera to show everything

---

## Development Order (Recommended)

### Phase 1: Multiplayer Foundations
1. ✅ **Multi-Pin Support** (needed for everything else)
2. ✅ **Player Colors** (simple, used by multi-pin)
3. ✅ **Correct Location Marker** (independent)

### Phase 2: Reveal Sequence
4. ✅ **Distance Display Labels** (depends on multi-pin)
5. ✅ **Arc Drawing** (most complex, can be last)
6. ✅ **Camera Animation** (polish, can be last)



## Integration with Multiplayer

Once features are complete, integration is straightforward:

```typescript
// When reveal phase starts (host)
multiPinManager.clearAllPins();

// Add all player pins
players.forEach(player => {
  multiPinManager.addPin(player.id, player.name, player.color, player.lat, player.lon);
});

// Show correct answer
correctMarker.show(correctAnswer.lat, correctAnswer.lon);

// Frame everything in view
const allLocations = [...playerLocations, correctAnswer];
await globe.animateCameraToFrame(allLocations);

// Draw arcs
players.forEach(player => {
  arcDrawer.addArc(player.lat, player.lon, correctAnswer.lat, correctAnswer.lon, player.color);
});
await arcDrawer.animateArcs(2000);

// Show distances
players.forEach(player => {
  const distance = calculateDistance(player.lat, player.lon, correctAnswer.lat, correctAnswer.lon);
  labelManager.addLabel(player.id, player.lat, player.lon, distance);
  labelManager.animateLabel(player.id, 1000);
});
```

---

## Success Criteria

**Each feature is complete when:**
- ✅ Can be tested in isolation (standalone HTML page)
- ✅ Works with mock data (no server needed)
- ✅ Has clear API (documented parameters and return values)
- ✅ Performs well (60 FPS with 8 players)
- ✅ Visually correct (pins, arcs, labels positioned accurately)

**All features together succeed when:**
- ✅ Full reveal sequence works smoothly
- ✅ Can display 8 players + correct answer simultaneously
- ✅ Camera animation frames everything properly
- ✅ Works on both desktop and mobile

---

## Next Steps

1. Start with `MultiPinManager` (foundational)
2. Create `test-multi-pin.html` to verify it works
3. Move to `CorrectLocationMarker` (simple, independent)
4. Add distance labels
5. Tackle arc drawing (most complex)
6. Add camera animation (polish)
7. Test full reveal sequence
