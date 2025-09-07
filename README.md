# Space Ship Generator

- **live**: https://benlirio.com/space-ship-client/
- **websocket server code**: https://github.com/BenLirio/space-ship-socket
- **front-end code**: https://github.com/BenLirio/space-ship-client

Serverless (AWS Lambda + HTTP API) TypeScript services that turn a text prompt into a complete 2D top‑down spaceship sprite set, store assets in S3, and keep a simple scoreboard in DynamoDB.

## How the flow works (high level)

1. Expand prompt (optional)

- POST /expand-prompt takes a short idea and returns a richer description to stabilize image quality.

2. Generate base ship

- POST /generate-space-ship with a prompt. Uses Gemini to create a PNG, stores it in S3, and returns a URL as the base sprite thrustersOnMuzzleOff.

3. Build full sprite sheet

- POST /generate-sprite-sheet with the base imageUrl. Derives the other variants:
  - thrustersOnMuzzleOn (AI generated)
  - thrustersOffMuzzleOff (AI generated)
  - thrustersOffMuzzleOn (composited by merging top/bottom halves)
    All variants are saved back to S3. Response returns URLs for each sprite key.

4. Resize for gameplay

- POST /resize with one or more image URLs. Produces cached, aspect‑preserving resized PNGs (no upscaling), stored in S3 under deterministic keys.

5. Compute bullet origins (optional helper)

- POST /diff-bounding-box comparing muzzleOff vs muzzleOn images to find muzzle‑flash regions; clients can convert those to gun origin points with a simple heuristic and fallback defaults.

6. Name the ship (optional)

- POST /name-ship returns a short, playful name for display/scoreboards.

7. Rate limit visibility

- GET /get-num-remaining-ships checks per‑IP usage against a DynamoDB counter. The generate endpoint also enforces the cap.

8. Scoreboard

- POST /scoreboard upserts a score entry. GET /scoreboard lists top scores (via a GSI).

Sprite keys used throughout

- thrustersOnMuzzleOn
- thrustersOnMuzzleOff (base from generation)
- thrustersOffMuzzleOn
- thrustersOffMuzzleOff

Where things are stored

- S3 bucket: SPACE_SHIP_BUCKET (default space-ship-sprites). Objects like:
  - generated/<uuid>.png
  - generated/<uuid>-thrustersOn-muzzleOn.png
  - resized/<hash>.png (deterministic cache by source URL + target size)
- DynamoDB tables:
  - Scoreboard: <service>-scoreboard-<stage> with GSI byScore
  - IP usage: <service>-ip-usage-<stage>

## Endpoints (concise)

- POST /expand-prompt → { expandedPrompt }
- POST /generate-space-ship → { sprites: { thrustersOnMuzzleOff: { url } } }
- POST /generate-sprite-sheet → { sprites: { thrustersOnMuzzleOn|thrustersOnMuzzleOff|thrustersOffMuzzleOn|thrustersOffMuzzleOff: { url } } }
- POST /resize → { items: [{ sourceUrl, resizedUrl, width, height, reusedExisting }], params }
- POST /diff-bounding-box → { boxes: [{ x,y,width,height,diffScore,pixels }], imageWidth, imageHeight }
- POST /name-ship → { name }
- GET /get-num-remaining-ships → { ip, remaining, cap }
- POST /scoreboard → { ok, item }
- GET /scoreboard → { items, count }

## What a client typically does (very high level)

- Expand prompt → Generate base image → Resize → Expand to 4 sprites → Resize new sprites → Diff muzzleOff vs muzzleOn for gun points → Name ship → Spawn → Broadcast game state.

The provided snippet in plain words

- Receives a prompt over WebSocket, expands it, generates a base sprite, resizes it, expands to all variants, resizes new ones, diffs images to estimate bullet origins (fallback if needed), generates a fun name, builds a ShipState with spawn/physics, and broadcasts it.

## Run locally

Prereqs

- Node 20+
- AWS credentials configured (for S3/Dynamo access)
- GEMINI_API_KEY env var

Install and start offline

- npm install
- npm run offline (HTTP API on http://localhost:3000)

Deploy to AWS

- npm run deploy

Remove stack

- npm run remove

## Configuration notes

- Model: GEMINI_MODEL (default gemini-2.5-flash-image-preview)
- Bucket: SPACE_SHIP_BUCKET (public read via object URL)
- Enforced rendering constraints are appended to prompts (see src/config.ts). Example reference images under assets/ are sent to the model as guidance.

## Dev utilities

- bin/examples/\* contain small shell helpers to hit endpoints and inspect outputs.

## License

ISC
