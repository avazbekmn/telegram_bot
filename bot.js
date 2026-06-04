require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const bot    = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN  = parseInt(process.env.ADMIN_ID);
const MENU_F = path.join(__dirname, 'menu.json');

// ── MENU ──────────────────────────────────────

function loadMenu() {
  if (!fs.existsSync(MENU_F)) {
    const def = {
      "Osh":      { sizes: { "Kichik": 15000, "O'rta": 25000, "Katta": 35000 } },
      "Shashlik": { sizes: { "1 tayoq": 18000, "2 tayoq": 35000 } },
      "Lagmon":   { sizes: { "Oddiy": 20000, "Qo'sh": 38000 } }
    };
    fs.writeFileSync(MENU_F, JSON.stringify(def, null, 2), 'utf8');
    return def;
  }
  return JSON.parse(fs.readFileSync(MENU_F, 'utf8'));
}

function saveMenu(menu) {
  fs.writeFileSync(MENU_F, JSON.stringify(menu, null, 2), 'utf8');
}

// ── SANA ──────────────────────────────────────

function getDeliveryOptions() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tashkent' }));
  const fmt = d => d.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent' });
  const today    = fmt(now);
  const tomorrow = fmt(new Date(now.getTime() + 86400000));
  if (now.getHours() < 12) {
    return [`📅 Bugun — ${today}`, `📅 Ertaga — ${tomorrow}`];
  }
  return [`📅 Ertaga — ${tomorrow}`];
}

// ── SESSION ───────────────────────────────────

const sessions = {};

function getSession(id) {
  if (!sessions[id]) sessions[id] = { step: 'idle', data: {} };
  return sessions[id];
}

function resetSession(id) {
  sessions[id] = { step: 'idle', data: {} };
}

// ── KLAVIATURA ────────────────────────────────

function replyKb(buttons, cols = 2) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += cols) {
    rows.push(buttons.slice(i, i + cols).map(text => ({ text })));
  }
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

function removeKb() {
  return { reply_markup: { remove_keyboard: true } };
}

function inlineKb(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

// ── XABARLAR ──────────────────────────────────

bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  resetSession(id);
  getSession(id);
  bot.sendMessage(id,
    'Assalomu alaykum! 👋\n\nBuyurtma berish yoki menyuni ko\'rish uchun tanlang.',
    replyKb(['📦 Buyurtma berish', '📋 Menyu ko\'rish'])
  );
});

bot.onText(/\/admin/, (msg) => {
  if (msg.chat.id !== ADMIN) return;
  bot.sendMessage(ADMIN, '👨‍💼 Admin panel:', inlineKb([
    [{ text: '📋 Menyuni ko\'rish',    callback_data: 'admin_view' }],
    [{ text: '✏️ Menyuni yangilash',   callback_data: 'admin_edit' }],
  ]));
});

// ── ASOSIY XABAR HANDLERI ─────────────────────

bot.on('message', (msg) => {
  
  console.log('MSG:', msg.chat.id, '| step:', getSession(msg.chat.id).step, '| text:', msg.text, '| contact:', !!msg.contact);

  if (!msg.text && !msg.contact) return;
  if (msg.text && msg.text.startsWith('/')) return;

  const id  = msg.chat.id;
  const s   = getSession(id);
  const txt = msg.text || '';

  // ── Menyu ko'rish
  if (txt === '📋 Menyu ko\'rish') {
    const menu = loadMenu();
    let text = '📋 *Bugungi menyu:*\n\n';
    for (const [product, info] of Object.entries(menu)) {
      text += `*${product}*\n`;
      for (const [size, price] of Object.entries(info.sizes)) {
        text += `  • ${size} — ${price.toLocaleString()} so\'m\n`;
      }
      text += '\n';
    }
    return bot.sendMessage(id, text, { parse_mode: 'Markdown' });
  }

  // ── Buyurtma boshlash
  if (txt === '📦 Buyurtma berish') {
    resetSession(id);
    const s2 = getSession(id);
    s2.step = 'phone';
    return bot.sendMessage(id, 'Telefon raqamingizni yuboring:', {
      reply_markup: {
        keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }]],
        resize_keyboard: true
      }
    });
  }

  // ── 1-qadam: telefon
  if (s.step === 'phone') {
      if (!msg.contact && !txt) return;
    s.data.phone = msg.contact ? msg.contact.phone_number : txt;
    s.step = 'product';
    const menu = loadMenu();
    return bot.sendMessage(id, 'Mahsulotni tanlang:', replyKb(Object.keys(menu)));
  }

  // ── 2-qadam: mahsulot
  if (s.step === 'product') {
    const menu = loadMenu();
    if (!menu[txt]) {
      return bot.sendMessage(id, 'Iltimos, ro\'yxatdan tanlang:', replyKb(Object.keys(menu)));
    }
    s.data.product = txt;
    s.step = 'size';
    const sizeButtons = Object.entries(menu[txt].sizes)
      .map(([size, price]) => `${size} — ${price.toLocaleString()} so'm`);
    return bot.sendMessage(id, `*${txt}* — hajmini tanlang:`, {
      parse_mode: 'Markdown',
      ...replyKb(sizeButtons, 1)
    });
  }

  // ── 3-qadam: hajm
  if (s.step === 'size') {
    const menu = loadMenu();
    const sizes = menu[s.data.product].sizes;
    let chosenSize = null, chosenPrice = null;
    for (const [size, price] of Object.entries(sizes)) {
      if (txt.startsWith(size)) { chosenSize = size; chosenPrice = price; break; }
    }
    if (!chosenSize) {
      const sizeButtons = Object.entries(sizes).map(([sz, pr]) => `${sz} — ${pr.toLocaleString()} so'm`);
      return bot.sendMessage(id, 'Iltimos, ro\'yxatdan tanlang:', replyKb(sizeButtons, 1));
    }
    s.data.size  = chosenSize;
    s.data.price = chosenPrice;
    s.step = 'date';
    const options = getDeliveryOptions();
    return bot.sendMessage(id, 'Yetkazib berish kunini tanlang:', replyKb(options, 1));
  }

  // ── 4-qadam: sana
  if (s.step === 'date') {
    if (!txt.includes('📅')) {
      return bot.sendMessage(id, 'Iltimos, tugmadan tanlang:', replyKb(getDeliveryOptions(), 1));
    }
    s.data.date = txt;
    s.step = 'info';
    return bot.sendMessage(id,
      'Ism va yetkazib berish manzilini kiriting:\n\n<b>Namuna: Alisher — Navoiy ko\'chasi 5-uy</b>',
      { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
    );
  }

  // ── 5-qadam: ism + manzil (OXIRGI)
  if (s.step === 'info') {
    if (!txt || txt.length < 5) {
      return bot.sendMessage(id,
        'Iltimos, ism va manzilni kiriting:\n<b>Namuna: Alisher — Navoiy ko\'chasi 5-uy</b>',
        { parse_mode: 'HTML' }
      );
    }

    const { phone, product, size, price, date } = s.data;
    resetSession(id);

    const orderText =
      `🆕 *Yangi buyurtma!*\n\n` +
      `👤 Ism/Manzil: ${txt}\n` +
      `📱 Telefon: ${phone}\n` +
      `📦 Mahsulot: ${product} (${size})\n` +
      `💰 Narx: ${price.toLocaleString()} so'm\n` +
      `📅 Sana: ${date}\n` +
      `🆔 User ID: ${id}`;

    bot.sendMessage(ADMIN, orderText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Qabul', callback_data: `approve_${id}` },
          { text: '❌ Bekor', callback_data: `reject_${id}` },
        ]]
      }
    });

    bot.sendMessage(id,
      `✅ *Buyurtmangiz qabul qilindi!*\n\n` +
      `📦 ${product} (${size}) — ${price.toLocaleString()} so'm\n` +
      `📅 ${date}\n\n` +
      `Tez orada bog'lanamiz! 🚀`,
      { parse_mode: 'Markdown', ...replyKb(['📦 Buyurtma berish', '📋 Menyu ko\'rish']) }
    );
    return;
  }

  // Boshqa holat — restart
 // Boshqa holat — restart
if (s.step === 'admin_menu_edit' && txt) {
    try {
      const clean = txt.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      saveMenu(parsed);
      resetSession(id);
      return bot.sendMessage(id, '✅ Menyu yangilandi!');
    } catch (_) {
      return bot.sendMessage(id, '❌ JSON xato. Qayta yuboring.');
    }
  }

  if (s.step === 'idle' && txt) {
    bot.sendMessage(id, 'Boshlash uchun /start yuboring yoki tugmani bosing.',
      replyKb(['📦 Buyurtma berish', '📋 Menyu ko\'rish'])
    );
  }
});

// ── ADMIN CALLBACK ────────────────────────────

bot.on('callback_query', (q) => {
  const data = q.data;
  const msgId = q.message.message_id;
  const chatId = q.message.chat.id;

  if (data === 'admin_view') {
    const menu = loadMenu();
    bot.sendMessage(ADMIN, '```json\n' + JSON.stringify(menu, null, 2) + '\n```', { parse_mode: 'Markdown' });
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (data === 'admin_edit') {
    getSession(ADMIN).step = 'admin_menu_edit';
    const menu = loadMenu();
    bot.sendMessage(ADMIN,
      '✏️ Yangi menyuni JSON formatida yuboring:\n\n```json\n' +
      JSON.stringify(menu, null, 2) + '\n```',
      { parse_mode: 'Markdown' }
    );
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (data.startsWith('approve_')) {
    const userId = parseInt(data.split('_')[1]);
    bot.sendMessage(userId, '🎉 Buyurtmangiz tasdiqlandi! Tez orada yetkazib beramiz.');
    bot.editMessageText(q.message.text + '\n\n✅ Tasdiqlandi', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (data.startsWith('reject_')) {
    const userId = parseInt(data.split('_')[1]);
    bot.sendMessage(userId, '😔 Buyurtmangiz bekor qilindi. Qayta urinib ko\'ring.');
    bot.editMessageText(q.message.text + '\n\n❌ Bekor qilindi', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
    bot.answerCallbackQuery(q.id);
    return;
  }
});

// ── ADMIN MENYU YANGILASH ─────────────────────


console.log('Bot ishga tushdi ✅');
