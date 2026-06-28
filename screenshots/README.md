# Screenshots

The main [README](../README.md) embeds the images below. Drop a PNG with the **exact filename** here and it renders
automatically — no README edit needed.

## How to capture (macOS, ~60s)
- **One window, clean shadow:** `Cmd + Shift + 4`, then press **Space**, then click the browser window.
- **A region:** `Cmd + Shift + 4`, then drag.
- By default these save to your Desktop — move/rename them into this folder, or set a default save location with
  `Cmd + Shift + 5` → Options → Save to.

Make sure you're signed in and have run **Begin research** on a product (e.g. the Orange Slice sample) so the pages
have real data.

## Expected files

| Filename | Page / state to capture |
|---|---|
| `landing.png` | `/` — the public landing page |
| `onboarding.png` | `/onboarding` — the product form (show the **Docs / llms.txt link** field) |
| `dashboard.png` | `/dashboard` — the pipeline funnel + product card with stage links |
| `report.png` | `/report/<id>` — competitors / B2B targets / universities / **scored builders** |
| `hackathon-scan.png` | the **Hackathon SDK scan** section of the report (after a Devpost scan) |
| `graph.png` | `/graph/<id>` — the tech-ecosystem graph |
| `outreach.png` | `/outreach/<id>` — offers + a drafted message (with **Push to Orange Slice**) |
| `improve.png` | `/improve/<id>` — feature suggestions + **share with engineering** |
| `signals.png` | `/signals/<id>` — the Fiber Tracker signal feed (fire a test signal first) |
| `launch.png` | `/launch/<id>` — the generated launch: hook, CAC projection, channel assets |

Then `git add screenshots && git commit && git push`.
