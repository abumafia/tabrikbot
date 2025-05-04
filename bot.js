const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();

// Muhit o'zgaruvchilari
const TOKEN = process.env.TELEGRAM_TOKEN || '7624885474:AAHj1FolBwjGBN3xLlSf7JECxoLLAyChRYk';
const URL = process.env.APP_URL || 'https://tabrikbot.onrender.com';
const PORT = process.env.PORT || 3000; // Render platformasida portni shu tarzda olamiz

const REFERRALS_FILE = 'referrals.json';
let referrals = {};

// Referral faylidan ma'lumotni yuklash
if (fs.existsSync(REFERRALS_FILE)) {
  referrals = JSON.parse(fs.readFileSync(REFERRALS_FILE));
}

// Referralni saqlovchi funksiya
function saveReferrals() {
  fs.writeFileSync(REFERRALS_FILE, JSON.stringify(referrals, null, 2));
}

// Botni webhook bilan ishga tushirish
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${URL}/bot${TOKEN}`);

app.use(bodyParser.json());

// Webhook endpoint
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// /start komandasi bilan referralni ishlatish
bot.onText(/\/start(?:\s+(\d+))?/, (msg, match) => {
  const userId = msg.from.id.toString();
  const referrerId = match[1];

  if (!referrals[userId]) {
    referrals[userId] = { invitedBy: referrerId || null, invites: [] };

    if (referrerId && referrals[referrerId]) {
      referrals[referrerId].invites.push(userId);

      bot.sendMessage(referrerId, `🎉 Siz yangi foydalanuvchini taklif qildingiz: @${msg.from.username || userId}`);
      bot.sendMessage(userId, `👋 Sizni @${referrerId} taklif qildi!`);
    }

    saveReferrals();
  }

  const keyboard = {
    keyboard: [['👥 Mening referallarim'], ['📱 Aplikatsiya'], ['❓ Yordam']],
    resize_keyboard: true,
  };

  bot.sendMessage(userId, `Assalomu alaykum, ${msg.from.first_name || 'do‘st'}!`, {
    reply_markup: keyboard,
  });
});

// Oddiy tugmalar uchun ishlovchi qism
bot.on('message', (msg) => {
  const userId = msg.from.id.toString();
  const text = msg.text;

  if (text === '👥 Mening referallarim') {
    const link = `https://t.me/YOUR_BOT_USERNAME?start=${userId}`;
    const count = (referrals[userId]?.invites || []).length;

    bot.sendMessage(userId, `🔗 Referral havolangiz: ${link}\n👥 Taklif qilganlaringiz soni: ${count}`);
  }

  if (text === '📱 Aplikatsiya') {
    bot.sendMessage(userId, '📱 Android va iOS uchun aplikatsiya yuklash havolasi: https://example.com/app');
  }

  if (text === '❓ Yordam') {
    bot.sendMessage(userId, 'Yordam uchun admin: @Google_m2');
  }
});

// Admin uchun broadcast komandasi
bot.onText(/\/broadcast (.+)/, (msg, match) => {
  const adminId = 6606638731;
  if (msg.from.id !== adminId) return;

  const message = match[1];
  Object.keys(referrals).forEach(uid => {
    bot.sendMessage(uid, `📢 E'lon: ${message}`).catch(() => {});
  });

  bot.sendMessage(adminId, '✅ Hamma foydalanuvchilarga yuborildi.');
});

// Express serverni ishga tushirish
app.listen(PORT, () => {
  console.log(`🚀 Bot webhook rejimida port ${PORT} da ishlayapti`);
});
