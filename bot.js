const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const app = express();

// Muhit o'zgaruvchilari
const TOKEN = process.env.TELEGRAM_TOKEN || '7624885474:AAHj1FolBwjGBN3xLlSf7JECxoLLAyChRYk';
const URL = process.env.APP_URL || 'https://tabrikbot.onrender.com';
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://tabrikbot:tabrikbot@tabrikbot.iqoka2n.mongodb.net/?retryWrites=true&w=majority&appName=tabrikbot'; // MongoDB connection URI

// MongoDB connection
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB connection error:', err));

// MongoDB schema and model
const referralSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  invitedBy: { type: String, default: null },
  invites: { type: [String], default: [] },
});

const Referral = mongoose.model('Referral', referralSchema);

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
bot.onText(/\/start(?:\s+(\d+))?/, async (msg, match) => {
  const userId = msg.from.id.toString();
  const referrerId = match[1];

  try {
    let user = await Referral.findOne({ userId });

    if (!user) {
      // Create a new user
      user = new Referral({
        userId,
        invitedBy: referrerId || null,
      });

      if (referrerId) {
        const referrer = await Referral.findOne({ userId: referrerId });
        if (referrer) {
          referrer.invites.push(userId);
          await referrer.save();
        }
        bot.sendMessage(referrerId, `🎉 Siz yangi foydalanuvchini taklif qildingiz: @${msg.from.username || userId}`);
        bot.sendMessage(userId, `👋 Sizni @${referrerId} taklif qildi!`);
      }

      await user.save();
    }

    const keyboard = {
      keyboard: [['👥 Mening referallarim'], ['📱 Aplikatsiya'], ['❓ Yordam']],
      resize_keyboard: true,
    };

    bot.sendMessage(userId, `Assalomu alaykum, ${msg.from.first_name || 'do‘st'}!`, {
      reply_markup: keyboard,
    });
  } catch (err) {
    console.error(err);
  }
});

// Oddiy tugmalar uchun ishlovchi qism
bot.on('message', async (msg) => {
  const userId = msg.from.id.toString();
  const text = msg.text;

  if (text === '👥 Mening referallarim') {
    try {
      const user = await Referral.findOne({ userId });
      const link = `https://t.me/tabriklar_bot_uzbot?start=${userId}`;
      const count = user ? user.invites.length : 0;

      bot.sendMessage(userId, `🔗 Referral havolangiz: ${link}\n👥 Taklif qilganlaringiz soni: ${count}`);
    } catch (err) {
      console.error(err);
    }
  }

  if (text === '📱 Aplikatsiya') {
    bot.sendMessage(userId, '📱 Android va iOS uchun aplikatsiya yuklash havolasi: https://example.com/app');
  }

  if (text === '❓ Yordam') {
    bot.sendMessage(userId, 'Yordam uchun admin: @Google_m2');
  }
});

// Admin uchun broadcast komandasi
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const adminId = 6606638731;
  if (msg.from.id !== adminId) return;

  const message = match[1];

  try {
    const users = await Referral.find();
    users.forEach((user) => {
      bot.sendMessage(user.userId, `📢 E'lon: ${message}`).catch(() => {});
    });

    bot.sendMessage(adminId, '✅ Hamma foydalanuvchilarga yuborildi.');
  } catch (err) {
    console.error(err);
  }
});

// Express serverni ishga tushirish
app.listen(PORT, () => {
  console.log(`🚀 Bot webhook rejimida port ${PORT} da ishlayapti`);
});
