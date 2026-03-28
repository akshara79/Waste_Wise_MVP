# WasteWise MVP

- Live mini-dashboard (total checks, live vs fallback usage, most common category).
- Export classification history to JSON.

## Run Locally

1. Open index.html in a browser, or serve with a static server.
2. Optional: Open learn.html for the educational reference page.
3. Optional: Add Anthropic API key in the in-app API section.
4. Enter any item and click Classify.

## Demo Script (Competition)

Use these sample items:

1. "used tea bag" -> expected wet waste.
2. "old phone charger" -> expected e-waste.
3. "expired cough syrup" -> expected medical waste.
4. Edge case: disconnect internet and classify "newspaper" to demonstrate fallback behavior.

## Notes

- API key is stored in browser localStorage under wastewise_claude_api_key.
- History is stored in browser localStorage under wastewise_history.
- This is a frontend-only MVP, so API keys are exposed to the client environment.
- For production, move API calls behind a secure backend.

WasteWise is a static web MVP that helps users segregate waste correctly.

## Features

- Multi-page experience:
  - index.html (Tool)
  - learn.html (Learn)
- Accepts item text and classifies into:
  - Wet waste
  - Dry waste
  - Hazardous
  - E-waste
  - Medical
- Returns disposal tip and eco-impact fact.
- Color-coded and icon-based guidance.
- Claude API integration from frontend with strict JSON parsing.
- Offline fallback classifier if API key/network fails.
- Quick-pick chips for instant demo inputs.
- Voice input (browser-supported speech recognition).
- Copy result button for fast sharing.
- Persistent recent history with one-click reuse.
