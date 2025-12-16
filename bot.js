require('dotenv').config();
const { Telegraf, Markup, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const express = require('express');

// Express app webhook uchun (Render.com uchun)
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/bot') {
    // Telegram webhook handler
    bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } else {
    next();
  }
});

// MongoDB ulanish
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://abumafia0:abumafia0@abumafia.h1trttg.mongodb.net/tabrikbot?appName=abumafia')
  .then(() => console.log('MongoDB ulandi!'))
  .catch(err => console.error('MongoDB xatosi:', err));

// Schema va Modellar (kengaytirildi: senderEmail, recipientEmail qo'shildi)
const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  phone: String,
  email: String, // Yangi: email
  createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, default: () => uuidv4() },
  userTelegramId: { type: String, required: true },
  userName: String,
  userPhone: String,
  userEmail: String, // Yangi: jo'natuvchi email
  occasionType: String, // Tabrik holati (Tug'ilgan kun va h.k.)
  tabrikType: String, // Tabrik turi (Tekst, Audio qo'ng'iroq, Video qo'ng'iroq)
  senderName: String, // Yangi: Tabriknoma kim tomonidan (jo'natuvchi ismi, tabrik matnida ishlatiladi)
  recipientFirstName: String,
  recipientLastName: String,
  recipientPhone: String,
  recipientEmail: String, // Yangi: qabul qiluvchi email
  address: String, // Yashash manzili
  message: String,
  deliveryDate: Date,
  price: { type: Number, default: 30000 }, // Narx turga qarab
  paymentScreenshot: String,
  paymentVerified: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'completed'], 
    default: 'pending' 
  },
  adminNotes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: String,
  isActive: { type: Boolean, default: true }
});

const User = mongoose.model('User', userSchema);
const Order = mongoose.model('Order', orderSchema);
const Admin = mongoose.model('Admin', adminSchema);

// Telegraf va Scene yaratish
const bot = new Telegraf(process.env.BOT_TOKEN);

// Scene yaratish uchun Stage
const stage = new Scenes.Stage([
  createOrderScene(),
  supportScene()
]);

bot.use(session());
bot.use(stage.middleware());

// Boshlang'ich menyu
const mainMenu = Markup.keyboard([
  ['🎉 Tabrik Yo\'llash'],
  ['📞 Support', 'ℹ️ Haqida']
]).resize();

// Admin menyu
const adminMenu = Markup.keyboard([
  ['📋 Barcha arizalar', '⏳ Kutayotgan arizalar'],
  ['✅ Tasdiqlangan', '❌ Rad etilgan'],
  ['📊 Statistika', '🔙 Asosiy menyu']
]).resize();

// User session ma'lumotlari
const userStates = new Map();

// Tabrik yo'llash scene (kengaytirildi: email, senderName qo'shildi; admin ga yuborish screenshot bilan birga)
function createOrderScene() {
  const orderScene = new Scenes.BaseScene('orderScene');
  
  orderScene.enter(async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id.toString() });
    
    if (!user || !user.phone) {
      await ctx.reply('Iltimos, telefon raqamingizni yuboring:', Markup.keyboard([
        [Markup.button.contactRequest('📱 Telefon raqamni yuborish')]
      ]).resize());
      return; // contact kutish
    }
    
    // Email so'rash (agar bo'lmasa)
    if (!user.email) {
      ctx.session.waitingForEmail = true;
      await ctx.reply('Email manzilingizni kiriting (ixtiyoriy, lekin tavsiya etiladi):');
      return;
    }
    
    userStates.set(ctx.from.id, {
      step: 'occasionType',
      orderData: {}
    });
    
    await ctx.reply('Tabrik holatini tanlang:', Markup.keyboard([
      ['🎂 Tug\'ilgan kun', '🎊 Nikoh'],
      ['🎓 Bitiruv', '🏆 Muvaffaqiyat'],
      ['🎄 Yangi yil', '🌸 8-mart'],
      ['🔙 Asosiy menyu']
    ]).resize());
  });
  
  orderScene.on('contact', async (ctx) => {
    const contact = ctx.message.contact;
    const userId = ctx.from.id.toString();
    
    let user = await User.findOne({ telegramId: userId });
    if (!user) {
      user = new User({
        telegramId: userId,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        phone: contact.phone_number
      });
    } else {
      user.phone = contact.phone_number;
    }
    await user.save();
    
    // Email so'rash
    if (!user.email) {
      ctx.session.waitingForEmail = true;
      await ctx.reply('Email manzilingizni kiriting (ixtiyoriy, agar yo\'q bo\'lsa XYZ so\'zini kiriting):');
      return;
    }
    
    userStates.set(ctx.from.id, {
      step: 'occasionType',
      orderData: {}
    });
    
    await ctx.reply('Tabrik holatini tanlang:', Markup.keyboard([
      ['🎂 Tug\'ilgan kun', '🎊 Nikoh'],
      ['🎓 Bitiruv', '🏆 Muvaffaqiyat'],
      ['🎄 Yangi yil', '🌸 8-mart'],
      ['🔙 Asosiy menyu']
    ]).resize());
  });
  
  orderScene.on('text', async (ctx) => {
    const userId = ctx.from.id;
    
    // Email kutish
    if (ctx.session.waitingForEmail) {
      const user = await User.findOne({ telegramId: userId.toString() });
      user.email = ctx.message.text || null;
      await user.save();
      delete ctx.session.waitingForEmail;
      
      userStates.set(userId, {
        step: 'occasionType',
        orderData: {}
      });
      
      await ctx.reply('Tabrik holatini tanlang:', Markup.keyboard([
        ['🎂 Tug\'ilgan kun', '🎊 Nikoh'],
        ['🎓 Bitiruv', '🏆 Muvaffaqiyat'],
        ['🎄 Yangi yil', '🌸 8-mart'],
        ['🔙 Asosiy menyu']
      ]).resize());
      return;
    }
    
    const userState = userStates.get(userId) || { step: 'occasionType', orderData: {} };
    const text = ctx.message.text;
    
    switch (userState.step) {
      case 'occasionType':
        userState.orderData.occasionType = text;
        userState.step = 'tabrikType';
        userStates.set(userId, userState);
        
        await ctx.reply('Tabrik turini tanlang:', Markup.keyboard([
          ['📝 Oddiy tekst xabar (30 000 so\'m)', '📞 Qo\'ng\'iroq + Audio (50 000 so\'m)'],
          ['🎥 Qo\'ng\'iroq + Video (100 000 so\'m)', '🔙 Orqaga']
        ]).resize());
        break;
        
      case 'tabrikType':
        if (text === '🔙 Orqaga') {
          userState.step = 'occasionType';
          await ctx.reply('Tabrik holatini tanlang:', Markup.keyboard([
            ['🎂 Tug\'ilgan kun', '🎊 Nikoh'],
            ['🎓 Bitiruv', '🏆 Muvaffaqiyat'],
            ['🎄 Yangi yil', '🌸 8-mart'],
            ['🔙 Asosiy menyu']
          ]).resize());
          return;
        }
        let price = 30000;
        if (text.includes('Audio')) price = 50000;
        if (text.includes('Video')) price = 100000;
        userState.orderData.tabrikType = text;
        userState.orderData.price = price;
        userState.step = 'senderName';
        userStates.set(userId, userState);
        
        await ctx.reply('Tabriknoma kim tomonidan yuborilayotganini kiriting (masalan, "Do\'stingiz Ahmad" - tabrik matnida ko\'rsatiladi):');
        break;
        
      case 'senderName':
        userState.orderData.senderName = text;
        userState.step = 'recipientFirstName';
        userStates.set(userId, userState);
        
        await ctx.reply('Qabul qiluvchining ismini kiriting:');
        break;
        
      case 'recipientFirstName':
        userState.orderData.recipientFirstName = text;
        userState.step = 'recipientLastName';
        userStates.set(userId, userState);
        
        await ctx.reply('Qabul qiluvchining familiyasini kiriting:');
        break;
        
      case 'recipientLastName':
        userState.orderData.recipientLastName = text;
        userState.step = 'recipientPhone';
        userStates.set(userId, userState);
        
        await ctx.reply('Qabul qiluvchining telefon raqamini kiriting:');
        break;
        
      case 'recipientPhone':
        userState.orderData.recipientPhone = text;
        userState.step = 'recipientEmail';
        userStates.set(userId, userState);
        
        await ctx.reply('Qabul qiluvchining email manzilini kiriting (ixtiyoriy, agar yo\'q bo\'lsa XYZ so\'zini kiriting):');
        break;
        
      case 'recipientEmail':
        userState.orderData.recipientEmail = text || null;
        userState.step = 'address';
        userStates.set(userId, userState);
        
        await ctx.reply('Qabul qiluvchining yashash manzilini kiriting (shahar, ko\'cha, uy raqami):');
        break;
        
      case 'address':
        userState.orderData.address = text;
        userState.step = 'message';
        userStates.set(userId, userState);
        
        await ctx.reply('Tabrik matnini kiriting (masalan: "Sevimli [ism], [senderName] dan tabrikingiz! ..."):');
        break;
        
      case 'message':
        userState.orderData.message = text;
        userState.step = 'deliveryDate';
        userStates.set(userId, userState);
        
        await ctx.reply('Yetkazib berish sanasini kiriting (DD.MM.YYYY formatida):');
        break;
        
      case 'deliveryDate':
        const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
        if (!dateRegex.test(text)) {
          await ctx.reply('Iltimos, sana DD.MM.YYYY formatida kiriting. Misol: 25.12.2025');
          return;
        }
        
        const [day, month, year] = text.split('.');
        const deliveryDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        
        if (isNaN(deliveryDate.getTime())) {
          await ctx.reply('Noto\'g\'ri sana format! Iltimos, qaytadan kiriting.');
          return;
        }
        
        userState.orderData.deliveryDate = deliveryDate;
        userState.step = 'summary';
        userStates.set(userId, userState);
        
        // Ma'lumotlarni ko'rsatish (kengaytirilgan)
        const user = await User.findOne({ telegramId: userId.toString() });
        const summary = `
📋 ARIZA MA'LUMOTLARI:

🎉 Tabrik holati: ${userState.orderData.occasionType}
📋 Tabrik turi: ${userState.orderData.tabrikType}
💰 Narxi: ${userState.orderData.price.toLocaleString()} so'm

👤 Jo'natuvchi (tabriknoma kim tomonidan): ${userState.orderData.senderName}
📧 Jo'natuvchi email: ${user.email || 'Kiritilmagan'}
📞 Jo'natuvchi tel: ${user.phone}

👤 Qabul qiluvchi: ${userState.orderData.recipientFirstName} ${userState.orderData.recipientLastName}
📞 Qabul qiluvchi tel: ${userState.orderData.recipientPhone}
📧 Qabul qiluvchi email: ${userState.orderData.recipientEmail || 'Kiritilmagan'}
🏠 Manzil: ${userState.orderData.address}
💌 Xabar: ${userState.orderData.message}
📅 Yetkazish sanasi: ${text}

Arizangizni tasdiqlaysizmi?
        `;
        
        await ctx.reply(summary, Markup.keyboard([
          ['✅ Tasdiqlash', '❌ Bekor qilish']
        ]).resize());
        break;
        
      case 'summary':
        if (text === '✅ Tasdiqlash') {
          const user = await User.findOne({ telegramId: userId.toString() });
          
          // Yangi order yaratish (lekin admin ga yubormaslik, screenshot kutish)
          const newOrder = new Order({
            userTelegramId: userId.toString(),
            userName: `${user.firstName} ${user.lastName || ''}`,
            userPhone: user.phone,
            userEmail: user.email,
            occasionType: userState.orderData.occasionType,
            tabrikType: userState.orderData.tabrikType,
            senderName: userState.orderData.senderName,
            recipientFirstName: userState.orderData.recipientFirstName,
            recipientLastName: userState.orderData.recipientLastName,
            recipientPhone: userState.orderData.recipientPhone,
            recipientEmail: userState.orderData.recipientEmail,
            address: userState.orderData.address,
            message: userState.orderData.message,
            deliveryDate: userState.orderData.deliveryDate,
            price: userState.orderData.price,
            status: 'pending'
          });
          
          await newOrder.save();
          
          await ctx.reply(`✅ Arizangiz qabul qilindi! ID: ${newOrder.orderId}\n\nTo'lov qilish uchun karta raqam:\n💳 8600 12** **** 1234\nNarxi: ${newOrder.price.toLocaleString()} so'm\n\nTo'lov qilganingizdan so'ng screenshotni shu yerga yuboring.`, 
            Markup.keyboard([['📸 Screenshot yuborish', '🔙 Asosiy menyu']]).resize());
          
          userStates.delete(userId);
          userState.step = 'payment';
          userStates.set(userId, userState);
        } else if (text === '❌ Bekor qilish') {
          await ctx.reply('Ariza bekor qilindi.', mainMenu);
          userStates.delete(userId);
          return ctx.scene.leave();
        }
        break;
        
      case 'payment':
        if (text === '🔙 Asosiy menyu') {
          await ctx.reply('Asosiy menyu:', mainMenu);
          userStates.delete(userId);
          return ctx.scene.leave();
        } else if (text === '📸 Screenshot yuborish') {
          await ctx.reply('Screenshotni yuklang (rasm):');
        }
        break;
    }
  });
  
  orderScene.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const userState = userStates.get(userId);
    
    if (userState && userState.step === 'payment') {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileId = photo.file_id;
      
      // Oxirgi ariza
      const latestOrder = await Order.findOne({ 
        userTelegramId: userId.toString(),
        status: 'pending'
      }).sort({ createdAt: -1 });
      
      if (latestOrder) {
        latestOrder.paymentScreenshot = fileId;
        latestOrder.paymentVerified = false;
        await latestOrder.save();
        
        // Adminlarga to'liq ariza + screenshot yuborish (bir xabarda)
        const admins = await Admin.find({ isActive: true });
        const fullInfo = `
🆕 YANGI ARIZA + TO'LOV!

📌 ID: ${latestOrder.orderId}
👤 Jo'natuvchi: ${latestOrder.userName}
📧 Email: ${latestOrder.userEmail || 'Yo\'q'}
📞 Tel: ${latestOrder.userPhone}
🎉 Holati: ${latestOrder.occasionType}
📋 Turi: ${latestOrder.tabrikType}
💰 Narx: ${latestOrder.price.toLocaleString()} so'm
👤 Tabriknoma kim tomonidan: ${latestOrder.senderName}

👤 Qabul qiluvchi: ${latestOrder.recipientFirstName} ${latestOrder.recipientLastName}
📞 Qabul tel: ${latestOrder.recipientPhone}
📧 Qabul email: ${latestOrder.recipientEmail || 'Yo\'q'}
🏠 Manzil: ${latestOrder.address}
💌 Xabar: ${latestOrder.message}
📅 Sana: ${latestOrder.deliveryDate.toLocaleDateString('uz-UZ')}
        `;
        
        for (const admin of admins) {
          try {
            await bot.telegram.sendPhoto(
              admin.telegramId,
              fileId,
              {
                caption: fullInfo,
                reply_markup: Markup.inlineKeyboard([
                  [Markup.button.callback('✅ To\'lov tasdiqlash', `pay_approve_${latestOrder.orderId}`)],
                  [Markup.button.callback('❌ To\'lov rad etish', `pay_reject_${latestOrder.orderId}`)],
                  [Markup.button.callback('👁️ Batafsil', `details_${latestOrder.orderId}`)]
                ])
              }
            );
          } catch (error) {
            console.error(`Adminga yuborishda xatolik: ${error}`);
          }
        }
        
        await ctx.reply('✅ To\'lov screenshoti va arizangiz admin ga yuborildi! Javobni kuting.', mainMenu);
        userStates.delete(userId);
        return ctx.scene.leave();
      } else {
        await ctx.reply('Avval ariza to\'ldiring!');
      }
    }
  });
  
  return orderScene;
}

// Support scene (o'zgarmadi)
function supportScene() {
  const supportScene = new Scenes.BaseScene('supportScene');
  
  supportScene.enter(async (ctx) => {
    await ctx.reply('Support xizmati. Savolingizni yozing yoki "🔙 Asosiy menyu" tugmasini bosing:', 
      Markup.keyboard([['🔙 Asosiy menyu']]).resize());
  });
  
  supportScene.hears('🔙 Asosiy menyu', async (ctx) => {
    await ctx.reply('Asosiy menyu:', mainMenu);
    return ctx.scene.leave();
  });
  
  supportScene.on('text', async (ctx) => {
    if (ctx.message.text === '🔙 Asosiy menyu') return;
    
    const userId = ctx.from.id;
    const message = ctx.message.text;
    
    // Adminlarga support xabarini yuborish
    const admins = await Admin.find({ isActive: true });
    for (const admin of admins) {
      try {
        await bot.telegram.sendMessage(
          admin.telegramId,
          `📞 SUPPORT XABARI\n\nFoydalanuvchi: @${ctx.from.username || 'Noma\'lum'}\nID: ${userId}\n\nXabar: ${message}`,
          Markup.inlineKeyboard([
            Markup.button.callback('📨 Javob berish', `reply_${userId}`)
          ])
        );
      } catch (error) {
        console.error(`Adminga support xabarini yuborishda xatolik: ${error}`);
      }
    }
    
    await ctx.reply('✅ Xabaringiz supportga yuborildi. Tez orada javob olasiz.', mainMenu);
    return ctx.scene.leave();
  });
  
  return supportScene;
}

// Bot boshlang'ich komandasi
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  
  // Foydalanuvchini bazaga qo'shish
  let user = await User.findOne({ telegramId: userId });
  if (!user) {
    user = new User({
      telegramId: userId,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name
    });
    await user.save();
  }
  
  // Admin tekshirish
  const isAdmin = await Admin.findOne({ telegramId: userId });
  
  if (isAdmin) {
    await ctx.reply('👨‍💼 Admin paneliga xush kelibsiz!', adminMenu);
  } else {
    await ctx.reply(`Assalomu alaykum ${ctx.from.first_name}! \n\nTabriklar jo'natish xizmatiga xush kelibsiz. Quyidagi menyudan kerakli bo'limni tanlang:`, mainMenu);
  }
});

// Admin komandalari
bot.command('admin', async (ctx) => {
  const userId = ctx.from.id.toString();
  const admin = await Admin.findOne({ telegramId: userId });
  
  if (admin) {
    await ctx.reply('👨‍💼 Admin paneliga xush kelibsiz!', adminMenu);
  } else {
    await ctx.reply('Siz admin emassiz!');
  }
});

// Admin menyusi (yangi maydonlar qo'shildi)
bot.hears('📋 Barcha arizalar', async (ctx) => {
  const admin = await Admin.findOne({ telegramId: ctx.from.id.toString() });
  if (!admin) return;
  
  const orders = await Order.find().sort({ createdAt: -1 }).limit(10);
  
  if (orders.length === 0) {
    await ctx.reply('Hali hech qanday ariza yo\'q.');
    return;
  }
  
  let message = '📋 SO\'NGI 10 ARIZA:\n\n';
  orders.forEach(order => {
    message += `📌 ID: ${order.orderId}\n👤 ${order.userName}\n📋 Holat: ${order.occasionType}\n💰 Narx: ${order.price.toLocaleString()} so'm\n📅 ${order.createdAt.toLocaleDateString('uz-UZ')}\n📊 Holat: ${getStatusText(order.status)}\n\n`;
  });
  
  await ctx.reply(message);
});

bot.hears('⏳ Kutayotgan arizalar', async (ctx) => {
  const admin = await Admin.findOne({ telegramId: ctx.from.id.toString() });
  if (!admin) return;
  
  const orders = await Order.find({ status: 'pending' }).sort({ createdAt: -1 });
  
  if (orders.length === 0) {
    await ctx.reply('Kutayotgan arizalar yo\'q.');
    return;
  }
  
  for (const order of orders) {
    const text = `⏳ KUTAYOTGAN ARIZA\n\nID: ${order.orderId}\nFoydalanuvchi: ${order.userName}\nTel: ${order.userPhone}\nHolati: ${order.occasionType}\nTuri: ${order.tabrikType}\n💰 Narx: ${order.price.toLocaleString()} so'm\nQabul qiluvchi: ${order.recipientFirstName} ${order.recipientLastName}\nManzil: ${order.address}\nXabar: ${order.message.substring(0, 50)}...\nSana: ${order.deliveryDate.toLocaleDateString('uz-UZ')}\n\n${order.paymentScreenshot ? '✅ To\'lov screenshoti bor' : '❌ To\'lov screenshoti yo\'q'}`;
    
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('✅ Qabul qilish', `approve_${order.orderId}`),
      Markup.button.callback('❌ Rad etish', `reject_${order.orderId}`),
      Markup.button.callback('👁️ Batafsil', `details_${order.orderId}`)
    ]);
    
    await ctx.reply(text, keyboard);
  }
});

bot.hears('✅ Tasdiqlangan', async (ctx) => {
  const admin = await Admin.findOne({ telegramId: ctx.from.id.toString() });
  if (!admin) return;
  
  const orders = await Order.find({ status: 'approved' }).sort({ updatedAt: -1 }).limit(10);
  
  if (orders.length === 0) {
    await ctx.reply('Tasdiqlangan arizalar yo\'q.');
    return;
  }
  
  let message = '✅ TASDIQLANGAN ARIZALAR:\n\n';
  orders.forEach(order => {
    message += `📌 ID: ${order.orderId}\n👤 ${order.userName}\n💰 Narx: ${order.price.toLocaleString()} so'm\n📅 ${order.updatedAt.toLocaleDateString('uz-UZ')}\n\n`;
  });
  
  await ctx.reply(message);
});

bot.hears('❌ Rad etilgan', async (ctx) => {
  const admin = await Admin.findOne({ telegramId: ctx.from.id.toString() });
  if (!admin) return;
  
  const orders = await Order.find({ status: 'rejected' }).sort({ updatedAt: -1 }).limit(10);
  
  if (orders.length === 0) {
    await ctx.reply('Rad etilgan arizalar yo\'q.');
    return;
  }
  
  let message = '❌ RAD ETILGAN ARIZALAR:\n\n';
  orders.forEach(order => {
    message += `📌 ID: ${order.orderId}\n👤 ${order.userName}\n💰 Narx: ${order.price.toLocaleString()} so'm\n📅 ${order.updatedAt.toLocaleDateString('uz-UZ')}\nSabab: ${order.adminNotes || 'Sabab ko\'rsatilmagan'}\n\n`;
  });
  
  await ctx.reply(message);
});

bot.hears('📊 Statistika', async (ctx) => {
  const admin = await Admin.findOne({ telegramId: ctx.from.id.toString() });
  if (!admin) return;
  
  const totalOrders = await Order.countDocuments();
  const pendingOrders = await Order.countDocuments({ status: 'pending' });
  const approvedOrders = await Order.countDocuments({ status: 'approved' });
  const rejectedOrders = await Order.countDocuments({ status: 'rejected' });
  const totalUsers = await User.countDocuments();
  const totalRevenue = await Order.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$price' } } }]);
  
  const message = `
📊 BOT STATISTIKASI:

👥 Jami foydalanuvchilar: ${totalUsers}
📋 Jami arizalar: ${totalOrders}
⏳ Kutayotgan: ${pendingOrders}
✅ Tasdiqlangan: ${approvedOrders}
❌ Rad etilgan: ${rejectedOrders}
💰 Umumiy daromad: ${totalRevenue[0]?.total?.toLocaleString() || 0} so'm
  `;
  
  await ctx.reply(message);
});

bot.hears('🔙 Asosiy menyu', async (ctx) => {
  const admin = await Admin.findOne({ telegramId: ctx.from.id.toString() });
  
  if (admin) {
    await ctx.reply('👨‍💼 Admin paneliga xush kelibsiz!', adminMenu);
  } else {
    await ctx.reply('Asosiy menyu:', mainMenu);
  }
});

// Asosiy menyu
bot.hears('🎉 Tabrik Yo\'llash', async (ctx) => {
  await ctx.scene.enter('orderScene');
});

bot.hears('📞 Support', async (ctx) => {
  await ctx.scene.enter('supportScene');
});

bot.hears('ℹ️ Haqida', async (ctx) => {
  await ctx.reply(`
🤖 BOT HAQIDA

Bu bot orqali siz sevimlilaringizga tabrik xabarlari jo'natishingiz mumkin.

📋 Xizmatlar:
• Tabrik yo'llash (tekst, audio/video qo'ng'iroq)
• Support xizmati
• To'lov tizimi

💳 To'lov: Uzcard, Humo
🕐 Ish vaqti: 08:00 - 20:00
📞 Support: @Tabriklar_admin02
  `);
});

// Callback handler (yangi maydonlar qo'shildi)
bot.action(/approve_(.+)/, async (ctx) => {
  const orderId = ctx.match[1];
  const order = await Order.findOne({ orderId });
  
  if (order) {
    order.status = 'approved';
    order.updatedAt = new Date();
    await order.save();
    
    await ctx.answerCbQuery('Ariza tasdiqlandi!');
    await ctx.editMessageText(`✅ ARIZA TASDIQLANDI\n\nID: ${order.orderId}\nFoydalanuvchi: ${order.userName}\n💰 Narx: ${order.price.toLocaleString()} so'm\n\nHolat: Tasdiqlandi`);
    
    // Foydalanuvchiga xabar
    try {
      await bot.telegram.sendMessage(
        order.userTelegramId,
        `✅ Arizangiz tasdiqlandi!\n\nID: ${order.orderId}\nHolati: ${order.occasionType}\nTuri: ${order.tabrikType}\n💰 Narx: ${order.price.toLocaleString()} so'm\n\nTabrikingiz belgilangan sanada yetkazib beriladi.`
      );
    } catch (error) {
      console.error(`Foydalanuvchiga xabar yuborishda xatolik: ${error}`);
    }
  }
});

bot.action(/reject_(.+)/, async (ctx) => {
  const orderId = ctx.match[1];
  
  await ctx.answerCbQuery('Rad etish sababini kiriting.');
  await ctx.reply(`Ariza rad etilishi uchun sababni yozing (ID: ${orderId}):`);
  
  ctx.session.rejectingOrderId = orderId;
});

bot.on('text', async (ctx) => {
  if (ctx.session && ctx.session.rejectingOrderId) {
    const orderId = ctx.session.rejectingOrderId;
    const reason = ctx.message.text;
    
    const order = await Order.findOne({ orderId });
    
    if (order) {
      order.status = 'rejected';
      order.adminNotes = reason;
      order.updatedAt = new Date();
      await order.save();
      
      await ctx.reply(`❌ ARIZA RAD ETILDI\n\nID: ${order.orderId}\n💰 Narx: ${order.price.toLocaleString()} so'm\nSabab: ${reason}`);
      
      // Foydalanuvchiga xabar
      try {
        await bot.telegram.sendMessage(
          order.userTelegramId,
          `❌ Arizangiz rad etildi.\n\nID: ${order.orderId}\n💰 Narx: ${order.price.toLocaleString()} so'm\nSabab: ${reason}\n\nQo'shimcha ma'lumot uchun supportga murojaat qiling.`
        );
      } catch (error) {
        console.error(`Foydalanuvchiga xabar yuborishda xatolik: ${error}`);
      }
    }
    
    delete ctx.session.rejectingOrderId;
  }
});

bot.action(/details_(.+)/, async (ctx) => {
  const orderId = ctx.match[1];
  const order = await Order.findOne({ orderId });
  
  if (order) {
    const message = `
👁️ ARIZA TAFSILOTLARI:

📌 ID: ${order.orderId}
👤 Foydalanuvchi: ${order.userName}
📧 Email: ${order.userEmail || 'Yo\'q'}
📞 Tel: ${order.userPhone}
🎉 Holati: ${order.occasionType}
📋 Turi: ${order.tabrikType}
💰 Narx: ${order.price.toLocaleString()} so'm
👤 Tabriknoma kim tomonidan: ${order.senderName}

👤 Qabul qiluvchi: ${order.recipientFirstName} ${order.recipientLastName}
📞 Qabul tel: ${order.recipientPhone}
📧 Qabul email: ${order.recipientEmail || 'Yo\'q'}
🏠 Manzil: ${order.address}
💌 Xabar: ${order.message}
📅 Yetkazish sanasi: ${order.deliveryDate.toLocaleDateString('uz-UZ')}

📊 Holat: ${getStatusText(order.status)}
📅 Yaratilgan: ${order.createdAt.toLocaleDateString('uz-UZ')}
${order.adminNotes ? `📝 Admin izohi: ${order.adminNotes}` : ''}
    `;
    
    if (order.paymentScreenshot) {
      await ctx.replyWithPhoto(order.paymentScreenshot, { caption: message });
    } else {
      await ctx.reply(message);
    }
  }
  
  await ctx.answerCbQuery();
});

// To'lov tasdiqlash callbacklari (completed ga o'tkazish)
bot.action(/pay_approve_(.+)/, async (ctx) => {
  const orderId = ctx.match[1];
  const order = await Order.findOne({ orderId });
  
  if (order) {
    order.paymentVerified = true;
    order.status = 'completed'; // To'liq bajarilgan
    order.updatedAt = new Date();
    await order.save();
    
    await ctx.answerCbQuery('To\'lov tasdiqlandi!');
    await ctx.editMessageCaption(`💳 TO'LOV TASDIQLANDI\n\nAriza ID: ${order.orderId}\nFoydalanuvchi: ${order.userName}\n💰 Narx: ${order.price.toLocaleString()} so'm\n\nHolat: Bajarildi`);
    
    // Foydalanuvchiga xabar
    try {
      await bot.telegram.sendMessage(
        order.userTelegramId,
        `✅ To\'lovingiz tasdiqlandi! Arizangiz bajariladi.\n\nID: ${order.orderId}\n💰 Narx: ${order.price.toLocaleString()} so'm`
      );
    } catch (error) {
      console.error(`Foydalanuvchiga xabar yuborishda xatolik: ${error}`);
    }
  }
});

bot.action(/pay_reject_(.+)/, async (ctx) => {
  const orderId = ctx.match[1];
  const order = await Order.findOne({ orderId });
  
  if (order) {
    order.paymentVerified = false;
    order.adminNotes = 'To\'lov rad etildi';
    order.updatedAt = new Date();
    await order.save();
    
    await ctx.answerCbQuery('To\'lov rad etildi!');
    await ctx.editMessageCaption(`💳 TO'LOV RAD ETILDI\n\nAriza ID: ${order.orderId}\n💰 Narx: ${order.price.toLocaleString()} so'm\nSabab: To\'lov muammosi\n\nQayta urinib ko\'ring.`);
    
    // Foydalanuvchiga xabar
    try {
      await bot.telegram.sendMessage(
        order.userTelegramId,
        `❌ To\'lovingiz rad etildi. Sabab: To\'lov muammosi.\n\nID: ${order.orderId}\n💰 Narx: ${order.price.toLocaleString()} so'm\n\nQayta to\'lov qiling yoki supportga murojaat qiling.`
      );
    } catch (error) {
      console.error(`Foydalanuvchiga xabar yuborishda xatolik: ${error}`);
    }
  }
});

bot.action(/reply_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  
  await ctx.answerCbQuery('Javob yozing.');
  await ctx.reply(`Foydalanuvchiga javob yozing (ID: ${userId}):`);
  ctx.session.replyingTo = userId;
});

// Admin javob yozish
bot.on('text', async (ctx) => {
  if (ctx.session && ctx.session.replyingTo) {
    const userId = ctx.session.replyingTo;
    const message = ctx.message.text;
    
    try {
      await bot.telegram.sendMessage(
        userId,
        `📨 Support javobi:\n\n${message}\n\n🤖 Sizning suhbat ID: ${userId}`
      );
      await ctx.reply(`✅ Javob yuborildi foydalanuvchiga (ID: ${userId})`);
    } catch (error) {
      await ctx.reply(`❌ Foydalanuvchiga javob yuborish mumkin emas. Ehtimol botdan chiqib ketgan.`);
    }
    
    delete ctx.session.replyingTo;
  }
});

// Admin qo'shish
bot.command('addadmin', async (ctx) => {
  const userId = ctx.from.id.toString();
  
  const existingAdmin = await Admin.findOne({ telegramId: userId });
  
  if (!existingAdmin) {
    const newAdmin = new Admin({
      telegramId: userId,
      username: ctx.from.username
    });
    await newAdmin.save();
    await ctx.reply('✅ Siz admin qilindingiz!');
  } else {
    await ctx.reply('Siz allaqachon admin!');
  }
});

// Helper funksiyalar
function getStatusText(status) {
  const statusMap = {
    'pending': '⏳ Kutayotgan',
    'approved': '✅ Tasdiqlangan',
    'rejected': '❌ Rad etilgan',
    'completed': '✅ Bajarilgan'
  };
  return statusMap[status] || status;
}

// Xatoliklar
bot.catch((err, ctx) => {
  console.error(`Bot xatosi: ${err}`);
  if (ctx) ctx.reply('Xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.');
});

// Botni ishga tushirish (webhook yoki polling)
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // Render.com uchun webhook
  bot.telegram.setWebhook(`https://your-render-domain.onrender.com/bot`); // Render URL ni o'zgartiring
  app.listen(PORT, () => {
    console.log(`Server ${PORT} portda ishga tushdi (webhook mode)`);
  });
  bot.launch();
} else {
  // Localhost uchun polling
  bot.launch()
    .then(() => console.log('Bot polling mode da ishga tushdi!'));
}

// Agar adminlar bo'lmasa, asosiy admin qo'shish
async function setupAdmin() {
  const adminCount = await Admin.countDocuments();
  if (adminCount === 0 && process.env.ADMIN_ID) {
    const admin = new Admin({
      telegramId: process.env.ADMIN_ID.toString(),
      username: 'asosiy_admin'
    });
    await admin.save();
    console.log('Asosiy admin qo\'shildi');
  }
}

setupAdmin();

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
