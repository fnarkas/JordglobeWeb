# Development Strategy for Claude Code

## CRITICAL: Wait for User Verification at Checkpoints

**MOST IMPORTANT RULE:**
- **NEVER** continue to the next feature until the user has verified the current one works
- After implementing a feature, **STOP** and wait for user confirmation
- User needs to test and verify before we can commit and move forward
- This creates clear "checkpoints" where we know we're in a working state
- Makes debugging much easier by isolating changes
- Enables clean git commits at each checkpoint

**Workflow:**
1. Implement ONE feature completely
2. **STOP and WAIT** for user to test
3. User confirms: "Works!" or reports issues
4. Fix any issues and wait for re-verification
5. Only after user confirmation: move to next feature

**Example:**
```
Claude: "I've implemented the CorrectLocationMarker. Please test at http://localhost:3002/test-correct-marker.html"
[WAIT - do not continue with next feature]
User: "The marker is not visible"
Claude: [fixes the issue]
[WAIT - do not continue with next feature]
User: "Works now! Continue"
Claude: [NOW proceed to next feature]
```

## Testing Approach

### Prefer CLI-Based Testing Over Browser Testing

**Why:**
- Claude can see CLI output directly in the terminal
- No need for user to manually check browser and relay results
- Faster feedback loop
- Results are verifiable and can be included in the conversation
- Better for automated verification

**Implementation:**

When developing new features:

1. **Create CLI test scripts** instead of HTML test pages
   - Example: `scripts/test-segment-loader.ts`
   - Run with: `npm run test:segments`

2. **Use Node.js to test modules** before browser integration
   - Import the module in a Node script
   - Run test cases
   - Print results to console
   - Exit with appropriate code (0 = success, 1 = failure)

3. **Only create browser tests when** testing requires:
   - Visual rendering (3D graphics, UI)
   - Browser-specific APIs
   - User interaction

### Example

**Bad approach (browser test):**
```typescript
// public/test-something.html
// Claude: "Please open this page and tell me what you see"
// User: "I see X, Y, Z..."
```

**Good approach (CLI test):**
```typescript
// scripts/test-something.ts
import { something } from '../src/something.ts';

console.log('Testing something...');
const result = something();
console.log('Result:', result);
console.log(result.isValid ? '✓ Pass' : '✗ Fail');

// Claude can see the output directly
```

### Benefits

1. **Immediate feedback** - Claude sees results instantly
2. **Reproducible** - Same test can be run multiple times
3. **Scriptable** - Can be added to package.json scripts
4. **CI-ready** - Can be run in automated pipelines later
5. **Less context switching** - No need to switch between terminal and browser

### When to Use Each Approach

**CLI Testing (preferred):**
- Data loading and parsing
- Algorithm verification
- Data transformation
- API functionality
- Performance measurements
- Edge case validation

**Browser Testing (only when needed):**
- 3D rendering verification
- Visual appearance checks
- User interaction flows
- Browser-specific behavior
- Integration with Babylon.js scene

## Current Project Structure

### CLI Tools (preferred)
- `scripts/generate-segments.ts` - Generate segments.json
- `scripts/generate_borders.mjs` - Generate borders.bin

### Modules to Test
- `src/segmentLoader.ts` - Load and convert segments (should have CLI test)
- `src/borderLoader.ts` - Load border data (should have CLI test)

### Test Script Pattern

```json
// package.json
{
  "scripts": {
    "test:segments": "tsx scripts/test-segment-loader.ts",
    "test:borders": "tsx scripts/test-border-loader.ts"
  }
}
```

### Test Script Template

```typescript
#!/usr/bin/env node
/**
 * Test script for [module name]
 */

// 1. Import the module
import { something } from '../src/something';

// 2. Set up test data
console.log('=== Testing [Module] ===\n');

// 3. Run tests
try {
    console.log('Test 1: [description]');
    const result1 = something();
    console.log(result1 ? '  ✓ Pass' : '  ✗ Fail');

    console.log('\nTest 2: [description]');
    const result2 = somethingElse();
    console.log(result2 ? '  ✓ Pass' : '  ✗ Fail');

    // 4. Report results
    console.log('\n=== All tests passed ===');
    process.exit(0);

} catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exit(1);
}
```

## Summary

**Default to CLI testing** unless visual/interactive verification is required. This creates a faster, more reliable development workflow for both Claude and the developer.

## Development Server Architecture

### IMPORTANT: Server Management Rules

**CRITICAL: Claude must NEVER start, stop, or restart servers!**

The user manages all servers manually. Claude should only:
- ✅ Read log files to diagnose issues
- ✅ Advise when a server restart is needed
- ✅ Suggest configuration changes
- ❌ NEVER run commands to start/stop/restart servers
- ❌ NEVER kill processes or manage ports

### Fixed Port Assignments

**These ports are FIXED - do NOT change them:**

| Server | Port | Started By | Purpose |
|--------|------|-----------|---------|
| Vite Dev Server | **3000** | `npm run dev` | Web app hosting |
| WebSocket Game Server | **3003** | `npm run dev` | Multiplayer coordination |
| Browser Console Logger | **9999** | `npm run log-server` (optional) | Browser debugging |

### Current Running Servers

When you run `npm run dev`, TWO servers start automatically:

1. **Vite Dev Server** - http://localhost:3000
   - Serves the web application
   - Hot Module Reloading (HMR) - auto-reloads on file changes
   - Serves: `/party.html` (players), `/host.html` (leaderboard), `/bot-panel.html` (testing)

2. **WebSocket Game Server** - ws://localhost:3003
   - Manages multiplayer game state
   - Coordinates players, questions, answers, scoring
   - Server file: `server/index.mjs`
   - **Logging**: Writes to `game-server.log` + stdout

3. **Browser Console Log Server** - ws://localhost:9999 (OPTIONAL)
   - NOT started by `npm run dev` - must run separately with `npm run log-server`
   - Captures browser console output via WebSocket
   - Writes to `browser-console.log` for Claude to read
   - Server file: `scripts/log-server.mjs`
   - **Only start this when debugging browser-side issues**

### Server Logging Summary

| Server | Port | Log Location | How to View |
|--------|------|--------------|-------------|
| Vite | 3000 | stdout | Terminal where `npm run dev` runs |
| WebSocket Game | 3003 | **`game-server.log`** + stdout | `tail -f game-server.log` |
| Browser Console | 9999 | `browser-console.log` | `tail -f browser-console.log` |

**Key Points:**
- **Game Server** now logs to BOTH file and console - easier debugging!
- **Browser Console Logger** is OPTIONAL (not started by default)
- Game server log includes detailed message flow with timestamps

**Debugging the Game Server:**
```bash
# Watch game server logs in real-time
tail -f game-server.log

# Search for specific events
grep "next-round" game-server.log
grep "Bot Alice" game-server.log
```

### Always Running

The development servers are **always running** in the background via `npm run dev`:

- **Web Server URL**: `http://localhost:3000/`
- **WebSocket Server**: `ws://localhost:3003/`
- **Hot Module Reloading**:
  - Vite HMR: Browser code reloads automatically
  - Node `--watch`: Server code restarts automatically
- **No manual restarts needed**: File changes trigger automatic reloads

**Auto-Restart Behavior:**
- Browser code changes (`/src`, `/public`) → Vite HMR (instant, no page reload)
- Server code changes (`server/index.mjs`) → Node restarts (disconnects WebSocket clients temporarily)
- Log server changes (`scripts/log-server.mjs`) → Manual restart needed (not watched)

### Claude's Access to Server Output

Claude can monitor the dev server output using the `BashOutput` tool:

```typescript
// Check server status and any compilation errors
BashOutput(bash_id: "53b03e")
```

This allows Claude to:
- Verify the server is running
- Check which port it's using
- See compilation errors or warnings
- Monitor page reload events

### Testing Workflow

**Important**: Claude should **NOT** attempt to open the browser using `open http://localhost:3000/`.

**Correct workflow:**
1. Claude makes code changes
2. Vite automatically reloads the page
3. User tests in their already-open browser
4. User reports results (what works, what doesn't, console errors)

**Why:**
- User already has browser open and is actively testing
- Opening new tabs/windows is disruptive
- User can see visual behavior and interaction that Claude cannot
- User can check browser console for runtime errors

### When Browser Testing Is Needed

For this Babylon.js 3D globe application, most features require browser testing because they involve:
- 3D rendering and visual verification
- Mouse interaction (hover, click, drag)
- Camera controls and animations
- Shader rendering
- GUI elements

In these cases:
1. Claude makes the code changes
2. Claude monitors build output for compilation errors
3. User tests in browser and reports behavior
4. User reports any browser console errors or warnings

### Browser Console Logging

**Claude can see browser console logs!**

A WebSocket-based console logger captures `console.log/error/warn` and streams them to a file Claude can read.

**IMPORTANT: When creating new HTML pages, add this script tag:**
```html
<!-- Console logger - streams browser console to file for Claude -->
<script type="module" src="/shared/consoleLogger.ts"></script>
```

Add it at the end of `<body>`, after other scripts.

**Setup:**
1. Log server runs with: `npm run log-server`
2. Pages with the script tag auto-connect
3. Claude reads logs from `browser-console.log`

### Reporting Issues

When reporting issues from the browser, please include:
- **Behavior**: What happened vs. what was expected
- **Console errors**: Any errors or warnings (Claude can now see these automatically!)
- **Steps to reproduce**: What actions triggered the issue

## Babylon.js Common Pitfalls

### Vector Mutation: `normalize()` vs `normalizeToNew()`

**The Bug:**
```typescript
// ❌ WRONG - Mutates the vector!
const normal = position.normalize();

// ✅ CORRECT - Creates new vector
const normal = position.normalizeToNew();
```

**Why It's Tricky:**
- `normalize()` modifies AND returns the vector (silent mutation)
- Console logs show correct values initially, but mutations happen later in callbacks
- Bug doesn't appear until event handlers run (e.g., `updateStatus()` calling `getPosition()`)

**How to Debug:**
1. Query the actual scene graph: `scene.getNodeByName('myNode').position.length()`
2. Don't trust console logs alone - they show stale values
3. Search codebase for `.normalize(` - should probably be `.normalizeToNew()`

**Other methods to watch:** `scale()`, `add()`, `subtract()`, `multiply()` - all have `InPlace` variants
