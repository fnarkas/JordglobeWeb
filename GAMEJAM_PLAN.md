# Game Jam Plan

## Modules Overview

### Shared (Already exists)
- [x] `EarthGlobe` - 3D globe, pin placement, country picker

---

## Module Assignments

| Module | Owner | Status | Notes |
|--------|-------|--------|-------|
| **HOST (runs server too)** | | | |
| `HostApp.ts` - Entry + Socket.io server | Olle | | |
| `LobbyScreen.ts` - QR code, player list | Olle | | |
| `GameController.ts` - State machine, round logic | Olle | | |
| `QuestionDisplay.ts` - Show question on host | Olle | | |
| `AnswerIndicators.ts` - "Player X answered" | Olle | | |
| `ResultsScreen.ts` - Leaderboard | Olle | | |
| `questions.json` - Question bank | Olle | | |
| **CLIENT (Mobile)** | | | |
| `ClientApp.ts` - Entry, creates EarthGlobe | Kalle | | |
| `JoinScreen.ts` - Name input | Kalle | | |
| `WaitingScreen.ts` - "Waiting for others" | Kalle | | |
| `ResultScreen.ts` - Your score this round | Kalle | | |
| **SHARED** | | | |
| `EarthGlobe.ts` - 3D globe | Olle | | Kalle: request changes! |
| `types.ts` - Question, Player, GameState | Olle | | |
| `events.ts` - Socket event names | Olle | | |
| `scoring.ts` - Distance calc + score | Olle | | |

---

## Game Flow

```
1. HOST shows QR → clients scan
2. CLIENT enters name → appears on HOST lobby
3. FIRST PLAYER clicks "Start Game"
4. SERVER sends question → all screens show it
5. CLIENTS place pins → HOST shows checkmarks
6. All answered → SERVER broadcasts reveal
7. HOST shows all pins + scores
8. Repeat from step 4
```

---

## Socket Events

```typescript
// Client → Server
'join'           { name: string }
'start-game'     { }  // first player only
'submit-answer'  { lat, lon }

// Server → All
'player-joined'  { players: Player[] }
'game-start'     { }
'question'       { id, text, imageUrl? }
'player-answered'{ playerId }
'reveal'         { answers: [], correct: {lat, lon} }
'scores'         { leaderboard: [] }
```

---

## Priority Order

1. [ ] Server + Socket basics
2. [ ] Lobby (QR + join flow)
3. [ ] Question display (host + client)
4. [ ] Answer submission
5. [ ] Reveal + scoring
6. [ ] Polish (animations, sounds)

---

## Globe Features Needed (see GLOBE_FEATURES.md)

Features for the reveal sequence when showing results:

| Feature | Status | Description |
|---------|--------|-------------|
| `MultiPinManager` | ✅ Done | Display multiple player pins simultaneously |
| `CorrectLocationMarker` | ✅ Done | Gold star marker for correct answer |
| `ArcDrawer` | ❌ TODO | Animated geodesic arcs from player pins to correct location |
| `DistanceLabelManager` | ❌ TODO | Show "1,234 km" labels above pins with count-up animation |
| `animateCameraToFrame()` | ❌ TODO | Smoothly move camera to frame all pins + correct answer |
| Player Colors | ✅ Done | 8 distinguishable colors in `playerColors.ts` |

**Reveal Sequence Flow:**
1. Show all player pins (MultiPinManager)
2. Show correct answer marker (CorrectLocationMarker)
3. Frame camera to see everything (animateCameraToFrame)
4. Draw arcs from pins to correct location (ArcDrawer)
5. Show distance labels with count-up animation (DistanceLabelManager)

---

## EarthGlobe API for Client (Kalle)

Current public API you can use:
```typescript
const globe = new EarthGlobe('canvasId');

// Pin placement already works via PinManager
// Pin button is in GUI - triggers placing mode

// Get country at location
globe.getCountryAtLatLon(lat, lon);

// Callbacks when pin is placed
globe.pinManager.onPinPlaced((country, latLon) => {
  // Send to server: latLon.lat, latLon.lon
});
```

**Might need from Olle:**
- [ ] Constructor option: `{ showPinButton: boolean }` (hide on host)
- [ ] Constructor option: `{ showQuestionCard: boolean }` (hide on client?)
- [ ] Mobile touch optimization?
- [ ] Method to show other players' pins on reveal?

---

## IMPORTANT: Avoid Merge Conflicts

**Each person works in their own folder. Never edit the same file.**

```
src/
├── host/           ← Olle ONLY
│   ├── HostApp.ts
│   ├── GameController.ts
│   └── ...
├── client/         ← Kalle ONLY
│   ├── ClientApp.ts
│   ├── JoinScreen.ts
│   └── ...
├── shared/         ← Olle creates, Kalle imports (read-only for Kalle)
│   ├── types.ts
│   ├── events.ts
│   └── scoring.ts
└── earthGlobe.ts   ← Olle ONLY (Kalle: request changes, don't edit)
```

**Rules:**
1. Create new files in YOUR folder
2. Import from `shared/` - don't modify
3. Need a change in shared code? Ask the owner, don't edit yourself
4. Commit often to your own files

---

## Notes

- Host = Server (same machine, simpler)
- EarthGlobe already has `PinManager` - reuse for client
- Host creates EarthGlobe but hides pin button
- Use Vite for both host and client builds
