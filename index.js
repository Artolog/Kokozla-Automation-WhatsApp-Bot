import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { google } from "googleapis";
import fs from "fs";
import path from "path";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const OWNER_NUMBER = "27762433565@s.whatsapp.net"; // Dumisani's number
const SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE"; // Replace after setup
const CREDENTIALS_PATH = "./credentials.json"; // Google service account key

// ─── GOOGLE SHEETS ───────────────────────────────────────────────────────────

async function appendToSheet(values) {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) return;
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Bookings!A:J",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });
  } catch (err) {
    console.error("Sheets error:", err.message);
  }
}

function generateRef() {
  return "KL" + Date.now().toString().slice(-6);
}

// ─── SESSION STATE ────────────────────────────────────────────────────────────
// Each user has a session object tracking where they are in the flow

const sessions = {};

function getSession(jid) {
  if (!sessions[jid]) {
    sessions[jid] = { step: "menu", data: {} };
  }
  return sessions[jid];
}

function resetSession(jid) {
  sessions[jid] = { step: "menu", data: {} };
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────

const MENU = `Welcome to *Kokozela Logistics* 🚚

Your trusted delivery partner in the Vaal Triangle.

Reply with a number:
*1.* Get a delivery quote
*2.* Book a delivery
*3.* Our services & pricing
*4.* Speak to Dumisani
*0.* Main menu (any time)`;

const PRICING = `*Kokozela Logistics — Pricing*

📦 *Parcel & Document Delivery*
• Same town: R50 – R80
• Between towns: R80 – R150
• Urgent/priority: Additional fee

🛋️ *Furniture Transport*
• Small items: R150 – R300
• Large items: R300 – R800+

🏠 *Relocation Assistance*
• Single room: R500 – R1,200
• Apartment: R1,000 – R2,500
• House move: Custom quote
_(Loaders included in all relocation packages)_

🏪 *Business Deliveries*
• Monthly packages & contract rates available

Reply *1* to get a quote or *2* to book now.`;

const HUMAN_HANDOFF = `Connecting you to Dumisani now 👤

He typically responds within *15 minutes* during operating hours.

📞 076 243 3565
📧 KOKOZELALOGISTICS@kokozela.xyz

Thank you for your patience!`;

// ─── FLOW HANDLER ────────────────────────────────────────────────────────────

async function handleMessage(sock, jid, text) {
  const session = getSession(jid);
  const input = text.trim().toLowerCase();

  // Always allow returning to menu
  if (input === "0" || input === "menu") {
    resetSession(jid);
    return MENU;
  }

  // ── MENU ──
  if (session.step === "menu") {
    if (input === "1") {
      session.step = "quote_type";
      return `What are you sending?\n\n*1.* Parcel or document\n*2.* Furniture\n*3.* Relocation (full move)\n*4.* Other\n\n_(Reply 0 any time to return to menu)_`;
    }
    if (input === "2") {
      session.step = "book_name";
      return `Let's get your booking sorted 📋\n\nWhat is your *full name*?`;
    }
    if (input === "3") {
      return PRICING;
    }
    if (input === "4") {
      await notifyOwner(sock, jid, "Customer requested human assistance.");
      return HUMAN_HANDOFF;
    }
    return MENU;
  }

  // ── QUOTE FLOW ──
  if (session.step === "quote_type") {
    const types = { "1": "Parcel/Document", "2": "Furniture", "3": "Relocation", "4": "Other" };
    if (!types[input]) return `Please reply with *1*, *2*, *3*, or *4*.`;
    session.data.type = types[input];
    session.step = "quote_pickup";
    return `Got it — *${session.data.type}*.\n\nWhat is the *pickup location*? (Town or address)`;
  }

  if (session.step === "quote_pickup") {
    session.data.pickup = text;
    session.step = "quote_dropoff";
    return `And the *drop-off location*?`;
  }

  if (session.step === "quote_dropoff") {
    session.data.dropoff = text;
    session.step = "quote_result";

    // Simple quote logic based on type and locations
    let quote = "";
    const type = session.data.type;
    const pickup = session.data.pickup.toLowerCase();
    const dropoff = session.data.dropoff.toLowerCase();

    const towns = ["vanderbijlpark", "vereeniging", "sasolburg", "zamdela", "vaal"];
    const sameTown = towns.some(t => pickup.includes(t) && dropoff.includes(t));

    if (type === "Parcel/Document") {
      quote = sameTown ? "R50 – R80" : "R80 – R150";
    } else if (type === "Furniture") {
      quote = "R150 – R800+ depending on item size";
    } else if (type === "Relocation") {
      quote = "R500 – R2,500+ depending on move size (loaders included)";
    } else {
      quote = "R80 – R500 depending on details";
    }

    session.data.quote = quote;

    return `Based on your details:\n\n📍 From: ${session.data.pickup}\n📍 To: ${session.data.dropoff}\n📦 Type: ${type}\n\n💰 *Estimated quote: ${quote}*\n\nWould you like to book?\n*1.* Yes — confirm booking\n*2.* No — go back to menu`;
  }

  if (session.step === "quote_result") {
    if (input === "1") {
      session.step = "book_name";
      return `Let's confirm your booking 📋\n\nWhat is your *full name*?`;
    }
    resetSession(jid);
    return MENU;
  }

  // ── BOOKING FLOW ──
  if (session.step === "book_name") {
    session.data.name = text;
    session.step = "book_number";
    return `Thank you, *${session.data.name}*!\n\nWhat is your *contact number*?`;
  }

  if (session.step === "book_number") {
    session.data.number = text;
    session.step = "book_pickup";
    return `What is the *pickup address*?`;
  }

  if (session.step === "book_pickup") {
    session.data.pickup = text;
    session.step = "book_dropoff";
    return `What is the *drop-off address*?`;
  }

  if (session.step === "book_dropoff") {
    session.data.dropoff = text;
    session.step = "book_item";
    return `What are you sending? _(Brief description of item/s)_`;
  }

  if (session.step === "book_item") {
    session.data.item = text;
    session.step = "book_datetime";
    return `When do you need it delivered?\n_(Date and preferred time — e.g. "Today 3pm" or "Tomorrow morning")_`;
  }

  if (session.step === "book_datetime") {
    session.data.datetime = text;
    session.step = "menu";

    const ref = generateRef();
    session.data.ref = ref;
    const timestamp = new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });

    // Save to Google Sheets
    await appendToSheet([
      timestamp,
      ref,
      session.data.name,
      session.data.number,
      session.data.pickup,
      session.data.dropoff,
      session.data.item,
      session.data.datetime,
      session.data.quote || "To be confirmed",
      "Pending"
    ]);

    // Notify owner
    const ownerMsg =
      `🔔 *New Booking — ${ref}*\n\n` +
      `👤 ${session.data.name} | ${session.data.number}\n` +
      `📍 From: ${session.data.pickup}\n` +
      `📍 To: ${session.data.dropoff}\n` +
      `📦 Item: ${session.data.item}\n` +
      `🕐 Time: ${session.data.datetime}\n` +
      `💰 Quote: ${session.data.quote || "To be confirmed"}`;

    await notifyOwner(sock, jid, ownerMsg);
    resetSession(jid);

    return (
      `✅ *Booking Confirmed!*\n\n` +
      `Your reference: *${ref}*\n\n` +
      `📍 Pickup: ${session.data.pickup}\n` +
      `📍 Drop-off: ${session.data.dropoff}\n` +
      `📦 Item: ${session.data.item}\n` +
      `🕐 When: ${session.data.datetime}\n\n` +
      `💳 *Payment Details (EFT)*\n` +
      `Bank: FNB\n` +
      `Account Name: Kokozela Logistics\n` +
      `Account Number: 63213693096\n` +
      `Branch Code: 250655\n` +
      `Reference: *${ref}*\n\n` +
      `Please send proof of payment to *076 243 3565* on WhatsApp to confirm your booking.\n\n` +
      `A driver will be assigned within *45 minutes* of payment confirmation.\n\n` +
      `📞 076 243 3565\n` +
      `Thank you for choosing *Kokozela Logistics*! 🚚`
    );
  }

  return MENU;
}

// ─── NOTIFY OWNER ────────────────────────────────────────────────────────────

async function notifyOwner(sock, customerJid, message) {
  try {
    await sock.sendMessage(OWNER_NUMBER, { text: message });
  } catch (err) {
    console.error("Owner notify error:", err.message);
  }
}

// ─── SOCKET & CONNECTION ─────────────────────────────────────────────────────

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("connection.update", (update) => {
    console.log("connection update:", update);
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 Scan this QR code with your WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      console.log("================================");
      console.log("LAST DISCONNECT:");
      console.dir(lastDisconnect, { depth: null });
      console.log("================================");

      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("Connection closed. Reconnecting:", shouldReconnect);

      if (shouldReconnect) startBot();
}

    if (connection === "open") {
      console.log("\n✅ Kokozela Logistics Bot is live!\n");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      if (!jid || jid.includes("broadcast")) continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      if (!text) continue;

      console.log(`📩 [${jid}]: ${text}`);

      try {
        const reply = await handleMessage(sock, jid, text);
        if (reply) {
          await sock.sendMessage(jid, { text: reply });
        }
      } catch (err) {
        console.error("Message handler error:", err.message);
        await sock.sendMessage(jid, {
          text: "Sorry, something went wrong. Please try again or call us on 076 243 3565.",
        });
      }
    }
  });
}

startBot();
