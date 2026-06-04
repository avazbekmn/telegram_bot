# 🤖 Buyurtma qabul qiluvchi Telegram Bot

## Imkoniyatlar
- Buyurtma qabul qilish (ism, telefon, mahsulot, hajm, sana, manzil)
- Soat 12:00 gacha: bugun yoki ertaga tanlash
- Soat 12:00 dan keyin: faqat ertaga
- Admin har kuni menyuni yangilay oladi
- Admin buyurtmani ✅ qabul yoki ❌ bekor qiladi
- Tasdiqlangach foydalanuvchiga xabar ketadi

---

## O'rnatish

### 1. Fayllarni tayyorlash
```
order_bot/
├── bot.py
├── menu.json
├── requirements.txt
├── Procfile
└── .env
```

### 2. .env faylini to'ldirish
```
BOT_TOKEN=BotFather dan olingan token
ADMIN_ID=Sizning Telegram ID (@userinfobot dan bilib olasiz)
```

### 3. Lokal ishlatish
```bash
pip install -r requirements.txt
python bot.py
```

---

## 🚀 Railway.app ga deploy (BEPUL, 24/7)

1. **github.com** da hisob oching
2. Bu papkani GitHub repoga yuklang
3. **railway.app** ga kiring → GitHub bilan bog'lang
4. "New Project" → "Deploy from GitHub repo" → reponi tanlang
5. Settings → Variables ga kiring:
   - `BOT_TOKEN` = tokeningiz
   - `ADMIN_ID` = ID ingiz
6. Deploy tugmasini bosing → bot ishga tushadi ✅

Railway bepul oyiga $5 kredit beradi — bu bot uchun yetarli.

---

## 👨‍💼 Admin buyruqlari

| Buyruq | Vazifa |
|--------|--------|
| `/admin` | Admin panelini ochish |
| `📋 Menyuni ko'rish` | Joriy menyuni JSON da ko'rish |
| `✏️ Menyuni yangilash` | Yangi JSON yuborish |

### Menyu yangilash formati:
```json
{
  "Osh": {
    "sizes": {
      "Kichik": 15000,
      "O'rta": 25000,
      "Katta": 35000
    }
  },
  "Shashlik": {
    "sizes": {
      "1 tayoq": 18000,
      "2 tayoq": 35000
    }
  }
}
```

---

## Vaqt zonasi
Bot `Asia/Tashkent` vaqt zonasida ishlaydi.
Soat **12:00** — chegara.
