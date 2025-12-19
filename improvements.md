# Party Page Improvements

## 1. Show Distance Counting Animation for Each User

When results are revealed, show an animated counter that counts up from 0 to the player's actual distance.

**Implementation:**
- **`src/client/main.ts` - Update `showResults()`**:
  - Extract player's own result from the results array
  - Create animated counter that counts from 0 to player's distance over ~2 seconds
  - Show: "Your guess was X km away!" with the counting animation
  - Display points earned: "+X points"
  - Keep the full leaderboard visible (but make it less prominent than player's own result)

---

## 2. Don't Show Full Answer List on Party Clients

Players should only see their own result prominently, not everyone's detailed answers.

**Implementation:**
- **`src/client/main.ts` - Simplify results overlay**:
  - Show player's own distance/points prominently at top
  - Show simplified leaderboard: just names and points (no distances)
  - Remove the detailed "X km away" for other players
  - Format:
    ```
    YOUR RESULT
    📍 2,450 km away
    +3 points

    LEADERBOARD
    1. Alice - 5 pts
    2. You - 3 pts
    3. Bob - 1 pt
    ```

---

## 3. Hide Pin After Answer Submission

Once answer is submitted, disable further interaction with the pin system.

**Implementation:**
- **`src/client/main.ts` - Update `handleAnswerSubmitted()`**:
  - Get pinManager and call a new method to disable placing
  - Hide the preview pin
  - Disable the pin button

- **`src/pinManager.ts` - Add `disable()` method**:
  ```typescript
  public disable(): void {
      this.exitPlacingMode(false);  // Exit without placing
      this.previewPin?.setEnabled(false);
      // Remove event listeners or set disabled flag
  }
  ```

---

## 4. Make EarthGlobe Dumber - Further Decoupling

**Current issues:**
- EarthGlobe creates GUI elements (pin button, bottom panel)
- EarthGlobe manages keyboard shortcuts
- EarthGlobe knows about "placing mode" UI state

**Refactoring:**
- **Remove GUI creation from EarthGlobe**:
  - Move pin button creation to host page
  - Party page doesn't need any UI controls
  - Add option: `showPinUI: false` ✅ (already added!)

- **Simplify EarthGlobe responsibilities**:
  - ✅ Render globe, countries, water, skybox
  - ✅ Provide PinManager for external use
  - ✅ Provide CountryPicker for external use
  - ❌ Don't create UI controls
  - ❌ Don't manage keyboard shortcuts (move to pages)
  - ❌ Don't know about "game" concepts

- **Keep these in EarthGlobe** (they're rendering-specific):
  - Country animations (altitude/saturation)
  - Camera controls
  - Loading screen

**Specific changes:**
- ✅ Already done: `showPinUI: false` option
- Party page uses: `new EarthGlobe('renderCanvas', { showPinUI: false, disableSelectionBehavior: true })`
- Host page keeps: `new EarthGlobe('renderCanvas')` (defaults to showing UI)

---

## Summary of Changes

**Files to modify:**

1. **`src/client/main.ts`**:
   - Animated distance counter in results
   - Simplified results overlay (own result + leaderboard)
   - Disable pin after submission
   - Pass `showPinUI: false` option

2. **`src/pinManager.ts`**:
   - Add `disable()` method to prevent further interaction

3. **`src/earthGlobe.ts`**:
   - ✅ Already has `showPinUI` option
   - Optional: Move keyboard shortcuts to pages (cleanup)

---

## Expected Result

✅ **Better UX** - Players see their own result clearly with animation
✅ **Less clutter** - No detailed info about other players' guesses
✅ **Prevents cheating** - Can't change answer after submission
✅ **Cleaner architecture** - EarthGlobe is purely a rendering component
