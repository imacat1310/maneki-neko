# Maneki-Neko 招き猫 — personal finance with Mit

A local, no-build personal finance app in plain HTML/CSS/JS, modelled on Money Lover and guarded by **Mit**, a silver-tabby maneki-neko (lucky cat).

**Run it:** open `index.html` in a browser (double-click is fine; works from `file://`). All data stays in the browser's `localStorage`.

## Features (Money Lover-style)

| Tab | What it does |
| --- | --- |
| **Transactions** | Month tabs (… / last month / this month / future), opening/ending balance, inflow/outflow, list grouped by day **or** by category, search |
| **＋** | Add transaction: amount with calculator (`45000+12000`), category picker (Expense / Income / Debt-Loan), note, date, wallet, "with" person for debts |
| **Report** | Mascot insight, net income, weekly income vs expense bars, income & expense donuts, debts/loans, 6-month trend |
| **Budgets** | Money Lover-style gauge ("Amount you can spend"), monthly budgets per category or total, progress bars with a "today" marker, over-budget warnings |
| **Account** | Mascot & theme, wallets (add/edit/transfer), currency (VND, USD, EUR, JPY…), categories, JSON backup/restore, CSV export, sample data |

Mit reacts to how your money is going: sleepy when nothing's logged, happy or lucky when you're saving, worried when you overspend. Income drops koban coins. Tap the mascot in the header for tips.

## Realistic avatars & moods

The mascot is drawn from the pet's **real photo cut-out**, dressed as a maneki-neko (red collar + gold bell, koban coin, 福 fortune coin on the app icon). Nine moods, each with an emoji badge:

| Mood | Emoji | What changes on the real photo |
| --- | --- | --- |
| Calm | 😺 | catch-lights in the eyes |
| Happy | 😸 | smiling squint (cheek fur cloned over the lower eye), warm tone, ✨ |
| Lucky | 🤑 | gold star catch-lights, koban & 💰 |
| Love | 😻 | heart eyes, pink tone, ❤️ |
| Wink | 😼 | one eye closed with real fur |
| Surprised | 🙀 | eyes enlarged, ❗ |
| Worried | 😿 | worried brows, desaturated & cool, 💦 💸 |
| Sleepy | 😴 | both eyes closed (fur cloned from above the eye), night tone, 💤 🌙 |
| Party | 🥳 | party hat, 🎉 |

Eyes are found automatically. If they're missed, use **Adjust eyes** in Pet Studio and tap them. Switch between **Realistic** and **Cartoon** in Account.

## Pet Studio: turn your pet into the mascot

Account → **Add your pet** → choose **one or more photos** (up to 6) of the same character.

1. **Detect**: TensorFlow.js **COCO-SSD** finds the character. If the small model is unsure (curled up, lying down, side-on), a larger model takes a second look. From the second photo on, candidates are also **matched by colour** against the photos you already added, so the same character is picked when there are several animals.
2. **Cut out**: the **MediaPipe interactive segmenter** ("magic touch") cuts the character out of a crop around it, trying several points and keeping the best mask. If a mask swallows background, it's trimmed back to the character's colours. Offline fallback: a colour-model cut-out that refines itself over several passes.
3. **Find eyes** at any head angle, including lying on its side. A real eye needs an iris around a dark pupil, ideally with a catch-light. A side-on face with one visible eye works too.
4. **Build**: hi-res cut-out → realistic avatars in 9 moods (collar, hat and eyelids follow the head's angle), app icon & favicon, cartoon version, and an app theme with colours merged from all photos.

### Tools
- **✏️ Highlight pet**: paint over the character (🖌️), drag a **Box** (▭), or **Erase** (🧽), then **Scan**. Your brush strokes go straight to the AI segmenter. You can also tick "Let me highlight my pet in each photo" before choosing photos.
- **👀 Adjust eyes**: a zoomable view (pinch, scroll, ＋/−, double-tap). Tap to place the left and right eye, drag a circle to fine-tune, set the eye size, or mark "only one eye visible". Mood previews update live.
- **Multiple photos**: each photo becomes a template. ⭐ sets the main photo (used for the icon), and **Photo for <mood>** chooses which photo each mood uses. For example, use a real sleeping photo for 😴 Sleepy.

The AI parts download once (~6 MB model + ~12 MB runtime) and are cached for offline use. Photos never leave your device.

## On iPhone

Installed from Safari (**Share → Add to Home Screen**) it behaves like a native app:

- **Launch screens** for every current iPhone size, so there's no white flash while it starts.
- **Dark mode** follows the iPhone's appearance setting.
- **No zoom surprises**: 16px form fields (iOS zooms into anything smaller), no double-tap zoom, no pull-to-refresh bounce, no long-press callouts, and tap targets of at least 44px.
- **Safe areas** for the notch/Dynamic Island and the home indicator; sheets rise above the keyboard and scroll the focused field into view.
- **Pinch-to-zoom** inside the eye editor and highlight canvas without zooming the page.
- **Storage-friendly**: transactions and pet photos are stored separately, so everyday edits don't rewrite megabytes. Where Safari can't encode WebP, cut-outs are stored as a JPEG colour layer plus a small alpha mask instead of a large PNG. Photos kept for re-scans are 520px.
- **Lighter on memory and battery**: the avatar cache is capped, off-screen day cards are skipped while scrolling, search is debounced and capped at 150 results, and the "lucky" glow animation avoids expensive filters.
- Everything works offline after the first visit; the AI models (~18 MB) download on the first scan and are then cached.

## Files

```
index.html          app shell
css/style.css       styles (theme = CSS variables set at runtime)
js/avatar.js        realistic avatars: moods, emoji, collar/bell, stickers, app icon
js/mit-real.js      Mit's cut-out + eye positions (generated)
js/neko.js          cartoon SVG character generator, koban coin
js/store.js         data model, localStorage, money/date helpers, sample data
js/charts.js        SVG donut / bars / gauge
js/petstudio.js     pet recognition → cut-out, palette, sticker, theme
js/app.js           UI (views, sheets, events)
ava/                Mit's icons & avatars (generated) + original photo
```

### `ava/`

- `app-icon-real.png`, `favicon-real.png`: realistic app icon & favicon (used by the app)
- `mit-avatar-real-<mood>.png`: realistic round avatars, 9 moods with emoji badges
- `mit-real-<mood>.png`: realistic full-body stickers, 9 moods
- `mit-cutout.webp`: Mit's transparent cut-out
- `gallery.html`: live gallery of all realistic assets with download links
- `app-icon.svg/.png`, `app-icon-maskable.*`, `app-icon-gold.svg`, `favicon.svg`: cartoon app icons
- `mit-maneki*.svg`: full maneki-neko Mit in 6 moods (normal, happy, wink, sleepy, worried, surprised)
- `mit-avatar*.svg`: round head avatars
- `koban.svg`: the gold koban coin
- `example-*.svg`: what Pet Studio makes for other pets (shiba, bunny, black cat)
- `mit-photo.jpg` / `mit-sticker.jpg`: the original Mit photo

Realistic PNGs can be re-downloaded from `ava/gallery.html`. Regenerate the cartoon SVGs after editing `js/neko.js` (macOS, no Node needed):

```sh
osascript -l JavaScript ava/generate-ava.js "$PWD"
```
