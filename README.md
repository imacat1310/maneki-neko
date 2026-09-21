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

Account → **Add your pet** → choose a photo:

1. **Detect**: finds the main character with TensorFlow.js **COCO-SSD** (loaded from a CDN when online). If that's not available, it falls back to an **offline saliency detector** built in.
2. **Cut out**: foreground/background colour models, smoothing, largest blob, hole filling → a transparent cut-out.
3. **Read**: k-means palette → fur, light fur, stripe colour, eye and nose colour, coat pattern (tabby / solid / bicolour).
4. **Find eyes**: pairs of iris/pupil blobs side by side in the upper face.
5. **Build**: a hi-res transparent **cut-out** → realistic avatars in 9 moods, a realistic **app icon** and favicon, a cartoon **maneki-neko drawing** (optional), and a complete **app theme** (header, buttons, background, app name "Maneki <Name>").

Everything can be tweaked before saving (name, species, ears, coat, each colour, theme colour chips taken from the photo). Switch between themes at any time. Photos never leave your device.

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
