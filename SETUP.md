# 🤖 Discord Bot — Setup Guide

Follow these steps exactly and your bot will be running 24/7.

---

## Step 1 — Create your bot on Discord

1. Go to https://discord.com/developers/applications
2. Click **New Application** → give it a name → click **Create**
3. In the left sidebar click **Bot**
4. Click **Add Bot** → confirm
5. Under **Token** click **Reset Token** → copy it (save it somewhere safe)
6. Scroll down to **Privileged Gateway Intents** and turn ON:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
7. Click **Save Changes**

---

## Step 2 — Invite the bot to your server

1. In the left sidebar click **OAuth2** → **URL Generator**
2. Under **Scopes** check: `bot`
3. Under **Bot Permissions** check: `Administrator` (easiest for now)
4. Copy the generated URL at the bottom and open it in your browser
5. Select your server and click **Authorize**

---

## Step 3 — Set up your server channels

Make sure you have these channels in your Discord server (exact names):
- `welcome` — where welcome messages will be sent
- `mod-logs` — where ban/kick/warn logs will appear
- A category called `Tickets` will be created automatically

---

## Step 4 — Deploy on Railway (free hosting, runs 24/7)

1. Create a free account at https://railway.app
2. Create a new GitHub repository at https://github.com/new
   - Name it `discord-bot` → click **Create repository**
3. Upload all the bot files to that repo (drag and drop in the GitHub UI)
4. Go back to Railway → click **New Project** → **Deploy from GitHub repo**
5. Select your `discord-bot` repo
6. Once deployed, click your project → go to **Variables**
7. Add a variable:
   - Name: `DISCORD_TOKEN`
   - Value: (paste your bot token from Step 1)
8. Railway will restart the bot automatically — it's now online 24/7!

---

## 📋 Bot Commands

| Command | What it does |
|---|---|
| `!kick @user [reason]` | Kicks a user |
| `!ban @user [reason]` | Bans a user |
| `!unban <userID>` | Unbans a user |
| `!mute @user [minutes] [reason]` | Mutes (timeouts) a user |
| `!unmute @user` | Removes a mute |
| `!warn @user [reason]` | Warns a user |
| `!warnings @user` | Shows a user's warnings |
| `!clear <number>` | Deletes messages (max 100) |
| `!ticket` | Opens a support ticket |
| `!close` | Closes a ticket (mods only) |
| `!help` | Shows all commands |

---

## ⚙️ Customizing the bot

Open `index.js` and edit the **CONFIG** section at the top:

```js
const config = {
  prefix: '!',                    // Change the command prefix
  badWords: ['word1', 'word2'],   // Add words to auto-delete
  customCommands: {
    'rules': 'Your rules here',   // !rules will reply with this
    'socials': 'Your links here', // !socials will reply with this
  },
}
```

---

## ❓ Need more features?

Just ask and I'll add them!
