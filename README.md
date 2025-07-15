<p align="center">
  <img src="public/nutrilink-logo.png" alt="NutriLink Logo" width="200" />
</p>

<p align="center">🎬 Stream & Share Videos Instantly — Just Paste a Link</p>

---

## ✨ What is NutriLink?

**NutriLink** is a minimalist web app that lets you:

- Paste any public video URL (e.g., MP4 or WebM)
- Generate a unique, short link
- Share it with friends or social media
- Watch videos instantly on a sleek, mobile-friendly page
- View curated playlists with vertical scrolling like TikTok or Shorts
- Bonus: share via QR code, download video, or combine multiple links together

---

## 📦 Features

- 📼 Modern vertical video player with autoplay + swipe navigation
- 🔗 Short vanity links like `nutrilink-xi.vercel.app/v/abc123`
- 📚 Combine links: `nutrilink-xi.vercel.app/m/id1,id2,id3,...`
- 🧭 Seamless vertical scrolling (like TikTok or Instagram Reels)
- 🎮 Tap-to-pause & scrub video timeline
- 🔇 Global mute/unmute toggle across playlist
- ⬇️ Download video instantly
- 📱 Share via QR code modal
- 🏁 Ends playlist with “Thanks for watching” + return home
- 💾 Fully client-side (no backend required yet)

---

## 🚀 How to Use

1. Visit [nutrilink-xi.vercel.app](https://nutrilink-xi.vercel.app)
2. Paste a direct video URL (must be publicly accessible)
   - Example: `https://www.w3schools.com/html/mov_bbb.mp4`
3. Click **Generate Link**
4. Share the short link or scan the QR code
5. Watch a single video at `/v/:id` or a playlist at `/m/:id1,id2,id3,...`

---

## 🛠 Local Development

```bash
git clone [https://github.com/pocketfood/nutrilink.git](https://github.com/pocketfood/NutriLink.git)
cd nutrilink
npm install
npm run dev
