# Kokozela Logistics WhatsApp Bot
### Built by Kokozela Automations

---

## What this bot does
- Greets customers automatically
- Provides instant delivery quotes
- Collects full booking details
- Saves every booking to Google Sheets
- Notifies Dumisani instantly on WhatsApp
- Handles pricing enquiries 24/7

---

## Setup Guide (Step by Step)

### Step 1 — Install Node.js on Garuda Linux
```bash
sudo pacman -S nodejs npm
node --version  # should show v18+
```

### Step 2 — Install bot dependencies
```bash
cd kokozela-bot
npm install
```

### Step 3 — Set up Google Sheets (to save bookings)

1. Go to console.cloud.google.com
2. Create a new project called "Kokozela Bot"
3. Enable the Google Sheets API
4. Create a Service Account
5. Download the JSON key — save it as credentials.json in this folder
6. Create a Google Sheet called "Kokozela Bookings"
7. Add these headers in row 1:
   Timestamp | Ref | Name | Number | Pickup | Dropoff | Item | DateTime | Quote | Status
8. Share the sheet with your service account email (found in credentials.json)
9. Copy the Sheet ID from the URL and paste it in index.js where it says YOUR_GOOGLE_SHEET_ID_HERE

### Step 4 — Update your number in index.js
Find this line:
```
const OWNER_NUMBER = "27762433565@s.whatsapp.net";
```
Make sure it matches your WhatsApp number (27 + number without 0)

### Step 5 — Run the bot
```bash
node index.js
```

A QR code will appear in the terminal.
Open WhatsApp on your phone → Linked Devices → Link a Device
Scan the QR code.

The bot is now live on your WhatsApp number.

### Step 6 — Keep it running (optional)
Install PM2 to keep the bot running even after closing the terminal:
```bash
npm install -g pm2
pm2 start index.js --name kokozela-bot
pm2 save
pm2 startup
```

---

## Bot Flow Summary

```
Customer messages → Menu appears
├── 1. Quote → asks type, pickup, dropoff → gives estimate
├── 2. Book → collects name, number, addresses, item, time → saves to sheet + notifies you
├── 3. Pricing → sends full price list
└── 4. Human → notifies you to take over
```

---

## Folder Structure
```
kokozela-bot/
├── index.js          ← main bot logic
├── package.json      ← dependencies
├── credentials.json  ← Google Sheets key (you add this)
├── auth_info/        ← WhatsApp session (auto-created on first run)
└── README.md         ← this file
```

---

## Pricing this service to clients (Kokozela Automations)
- Starter Bot: R1,500 setup + R300/month
- Business Bot: R3,000 setup + R500/month
- Premium Bot: R5,000 setup + R800/month

---

Built with Baileys (WhatsApp Web API) + Google Sheets API
Kokozela Automations — Automate. Grow. Dominate.
