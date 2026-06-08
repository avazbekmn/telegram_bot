require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const bot   = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN = parseInt(process.env.ADMIN_ID);
const MENU_F = path.join(__dirname, 'menu.json');

// ── MENU ──────────────────────────────────────

function loadMenu() {
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

// Asosiy 4 ta tugmali bosh menyu
function mainMenu() {
  return replyKb([
    '📦 Buyurtma berish',
    '🖼 Katalog (rasm)',
    '✅ Mavjud mahsulotlar',
    '🏠 Bosh sahifa'
  ], 2);
}

// ── MAVJUD MAHSULOTLAR RO'YXATI ───────────────

function buildProductList() {
  const menu = loadMenu();
  let text = '🛒 *Mavjud mahsulotlar ro\'yxati*\n\n';
  for (const [catName, cat] of Object.entries(menu.categories)) {
    text += `*${catName}*\n`;
    for (const itemName of Object.keys(cat.items)) {
      text += `• ${itemName}\n`;
    }
    text += '\n';
  }
  return text;
}

// ── /start va /restart ────────────────────────

function sendStart(id) {
  resetSession(id);
  bot.sendMessage(id,
    '👋 *BINA Fresh* botiga xush kelibsiz!\n\nTabiiy meva sharbatlari, moxito, kokteyl va smuzilar. 🍎🍹\n\n 📲 Instagramda bizni kuzating: https://instagram.com/bina.fresh \n\nQuyidagi menyudan tanlang:',
    { parse_mode: 'Markdown', ...mainMenu() }
  );
}

bot.onText(/\/start/, (msg) => sendStart(msg.chat.id));
bot.onText(/\/restart/, (msg) => sendStart(msg.chat.id));

// ── ADMIN ─────────────────────────────────────

bot.onText(/\/admin/, (msg) => {
  if (msg.chat.id !== ADMIN) return;
  bot.sendMessage(ADMIN, '👨‍💼 Admin panel:', inlineKb([
    [{ text: '📋 Menyuni ko\'rish',  callback_data: 'admin_view' }],
    [{ text: '✏️ Menyuni yangilash', callback_data: 'admin_edit' }],
  ]));
});

// ── ASOSIY XABAR HANDLERI ─────────────────────

bot.on('message', async (msg) => {
  if (!msg.text && !msg.contact) return;
  if (msg.text && msg.text.startsWith('/')) return;

  const id  = msg.chat.id;
  const s   = getSession(id);
  const txt = msg.text || '';

  console.log('MSG:', id, '| step:', s.step, '| text:', txt, '| contact:', !!msg.contact);

  // ── Bosh sahifa
  if (txt === '🏠 Bosh sahifa') {
    return sendStart(id);
  }

  // ── Katalog (rasmli)
  if (txt === '🖼 Katalog (rasm)') {
    const menu = loadMenu();
    const images = menu._images || {};
    if (images.menu1 && images.menu2) {
      await bot.sendMediaGroup(id, [
        { type: 'photo', media: images.menu1 },
        {
          type: 'photo', media: images.menu2,
          caption: '🍎 *BINA Fresh — Menyu*\n\nBuyurtma berish uchun *📦 Buyurtma berish* tugmasini bosing!',
          parse_mode: 'Markdown'
        }
      ]);
    } else {
      await bot.sendMessage(id, '📷 Katalog rasmlari yuklanmagan. /admin orqali yuklab qo\'ying.');
    }
    return;
  }

  // ── Mavjud mahsulotlar ro'yxati
  if (txt === '✅ Mavjud mahsulotlar') {
    const listText = buildProductList();
    await bot.sendMessage(id, listText, {
      parse_mode: 'Markdown',
      ...mainMenu()
    });
    return;
  }

  // ── Buyurtma boshlash
  if (txt === '📦 Buyurtma berish') {
    resetSession(id);
    const s2 = getSession(id);
    s2.step = 'phone';
    return bot.sendMessage(id, '📱 Telefon raqamingizni yuboring:', {
      reply_markup: {
        keyboard: [
          [{ text: '📱 Raqamni yuborish', request_contact: true }],
          [{ text: '🏠 Bosh sahifa' }]
        ],
        resize_keyboard: true
      }
    });
  }

  // ── 1-qadam: telefon
  if (s.step === 'phone') {
    if (!msg.contact && !txt) return;
    if (txt === '🏠 Bosh sahifa') return sendStart(id);
    s.data.phone = msg.contact ? msg.contact.phone_number : txt;
    s.step = 'category';

    const menu = loadMenu();
    const catButtons = Object.keys(menu.categories);
    return bot.sendMessage(id,
      '🗂 Kategoriyani tanlang:',
      replyKb([...catButtons, '🏠 Bosh sahifa'], 2)
    );
  }

  // ── 2-qadam: kategoriya
  if (s.step === 'category') {
    if (txt === '🏠 Bosh sahifa') return sendStart(id);
    const menu = loadMenu();
    if (!menu.categories[txt]) {
      const catButtons = Object.keys(menu.categories);
      return bot.sendMessage(id, 'Iltimos, ro\'yxatdan tanlang:', replyKb([...catButtons, '🏠 Bosh sahifa'], 2));
    }
    s.data.category = txt;
    s.step = 'product';

    const cat = menu.categories[txt];
    const itemButtons = Object.keys(cat.items).map(name => `${cat.icon} ${name}`);
    return bot.sendMessage(id,
      `${txt} — mahsulotni tanlang:`,
      replyKb([...itemButtons, '⬅️ Orqaga', '🏠 Bosh sahifa'], 2)
    );
  }

  // ── 3-qadam: mahsulot
  if (s.step === 'product') {
    if (txt === '🏠 Bosh sahifa') return sendStart(id);
    if (txt === '⬅️ Orqaga') {
      s.step = 'category';
      const menu = loadMenu();
      const catButtons = Object.keys(menu.categories);
      return bot.sendMessage(id, '🗂 Kategoriyani tanlang:', replyKb([...catButtons, '🏠 Bosh sahifa'], 2));
    }

    const menu = loadMenu();
    const cat = menu.categories[s.data.category];
    // ikonkani olib tashlash (masalan "🍎 Olma" → "Olma")
    const cleanTxt = txt.replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\s]+/u, '').trim();
    const item = cat.items[cleanTxt];

    if (!item) {
      const itemButtons = Object.keys(cat.items).map(name => `${cat.icon} ${name}`);
      return bot.sendMessage(id, 'Iltimos, ro\'yxatdan tanlang:', replyKb([...itemButtons, '⬅️ Orqaga', '🏠 Bosh sahifa'], 2));
    }

    s.data.product = cleanTxt;
    s.step = 'size';

    const sizeButtons = Object.entries(item.sizes)
      .map(([size, price]) => `${size} — ${price.toLocaleString()} so'm`);
    return bot.sendMessage(id,
      `*${cleanTxt}* — hajm va narxni tanlang:`,
      { parse_mode: 'Markdown', ...replyKb([...sizeButtons, '⬅️ Orqaga', '🏠 Bosh sahifa'], 1) }
    );
  }

  // ── 4-qadam: hajm
  if (s.step === 'size') {
    if (txt === '🏠 Bosh sahifa') return sendStart(id);
    if (txt === '⬅️ Orqaga') {
      s.step = 'product';
      const menu = loadMenu();
      const cat = menu.categories[s.data.category];
      const itemButtons = Object.keys(cat.items).map(name => `${cat.icon} ${name}`);
      return bot.sendMessage(id,
        `${s.data.category} — mahsulotni tanlang:`,
        replyKb([...itemButtons, '⬅️ Orqaga', '🏠 Bosh sahifa'], 2)
      );
    }

    const menu = loadMenu();
    const sizes = menu.categories[s.data.category].items[s.data.product].sizes;
    let chosenSize = null, chosenPrice = null;
    for (const [size, price] of Object.entries(sizes)) {
      if (txt.startsWith(size)) { chosenSize = size; chosenPrice = price; break; }
    }
    if (!chosenSize) {
      const sizeButtons = Object.entries(sizes).map(([sz, pr]) => `${sz} — ${pr.toLocaleString()} so'm`);
      return bot.sendMessage(id, 'Iltimos, ro\'yxatdan tanlang:', replyKb([...sizeButtons, '⬅️ Orqaga', '🏠 Bosh sahifa'], 1));
    }

    s.data.size  = chosenSize;
    s.data.price = chosenPrice;
    s.step = 'date';

    const options = getDeliveryOptions();
    return bot.sendMessage(id, '📅 Yetkazib berish kunini tanlang:', replyKb([...options, '🏠 Bosh sahifa'], 1));
  }

  // ── 5-qadam: sana
  if (s.step === 'date') {
    if (txt === '🏠 Bosh sahifa') return sendStart(id);
    if (!txt.includes('📅')) {
      return bot.sendMessage(id, 'Iltimos, tugmadan tanlang:', replyKb([...getDeliveryOptions(), '🏠 Bosh sahifa'], 1));
    }
    s.data.date = txt;
    s.step = 'info';
    return bot.sendMessage(id,
      '📝 Ism va yetkazib berish manzilini kiriting:\n\n<b>Namuna: Alisher — Navoiy ko\'chasi 5-uy</b>',
      { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
    );
  }

  // ── 6-qadam: ism + manzil
  if (s.step === 'info') {
    if (!txt || txt.length < 5) {
      return bot.sendMessage(id,
        'Iltimos, ism va manzilni kiriting:\n<b>Namuna: Alisher — Navoiy ko\'chasi 5-uy</b>',
        { parse_mode: 'HTML' }
      );
    }

    const { phone, category, product, size, price, date } = s.data;
    resetSession(id);

    const orderText =
      `🆕 *Yangi buyurtma!*\n\n` +
      `👤 Ism/Manzil: ${txt}\n` +
      `📱 Telefon: ${phone}\n` +
      `🗂 Kategoriya: ${category}\n` +
      `📦 Mahsulot: ${product} (${size})\n` +
      `💰 Narx: ${price.toLocaleString()} so'm\n` +
      `📅 Sana: ${date}\n` +
      `🆔 User ID: ${id}`;

    bot.sendMessage(ADMIN, orderText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Qabul',  callback_data: `approve_${id}` },
          { text: '❌ Bekor',  callback_data: `reject_${id}` },
        ]]
      }
    });

    bot.sendMessage(id,
      `✅ *Buyurtmangiz qabul qilindi!*\n\n` +
      `📦 ${product} (${size}) — ${price.toLocaleString()} so'm\n` +
      `📅 ${date}\n\n` +
      `Tez orada bog'lanamiz! 🚀`,
      { parse_mode: 'Markdown', ...mainMenu() }
    );
    return;
  }

  // ── Admin menyu yangilash
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

  // ── Boshqa holat
  if (s.step === 'idle') {
    return sendStart(id);
  }
});

// ── RASM (admin uchun file_id olish) ─────────

bot.on('photo', (msg) => {
  if (msg.chat.id !== ADMIN) return;
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  console.log('FILE_ID:', fileId);
  bot.sendMessage(ADMIN, `📎 file_id:\n\`${fileId}\``, { parse_mode: 'Markdown' });
});

// ── ADMIN CALLBACK ────────────────────────────

bot.on('callback_query', (q) => {
  const data  = q.data;
  const msgId = q.message.message_id;
  const chatId = q.message.chat.id;

  if (data === 'admin_view') {
    const menu = loadMenu();
    bot.sendMessage(ADMIN,
      '```json\n' + JSON.stringify(menu, null, 2) + '\n```',
      { parse_mode: 'Markdown' }
    );
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
    bot.sendMessage(userId, '🎉 Buyurtmangiz tasdiqlandi! Tez orada yetkazib beramiz. 🚚');
    bot.editMessageText(q.message.text + '\n\n✅ *Tasdiqlandi*', {
      chat_id: chatId, message_id: msgId, parse_mode: 'Markdown'
    });
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (data.startsWith('reject_')) {
    const userId = parseInt(data.split('_')[1]);
    bot.sendMessage(userId, '😔 Buyurtmangiz bekor qilindi. Qayta urinib ko\'ring.');
    bot.editMessageText(q.message.text + '\n\n❌ *Bekor qilindi*', {
      chat_id: chatId, message_id: msgId, parse_mode: 'Markdown'
    });
    bot.answerCallbackQuery(q.id);
    return;
  }
});

console.log('Bot ishga tushdi ✅');
