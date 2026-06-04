import asyncio
import os
import json
from datetime import datetime, timedelta
import pytz

from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart, Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    ReplyKeyboardMarkup, KeyboardButton,
    InlineKeyboardMarkup, InlineKeyboardButton,
    ReplyKeyboardRemove
)
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN  = os.getenv("BOT_TOKEN")
ADMIN_ID   = int(os.getenv("ADMIN_ID"))
TZ         = pytz.timezone("Asia/Tashkent")
MENU_FILE  = "menu.json"

bot = Bot(token=BOT_TOKEN)
dp  = Dispatcher(storage=MemoryStorage())

# ─────────────────────────────────────────────
# MENU: fayldan o'qish / yozish
# ─────────────────────────────────────────────

def load_menu() -> dict:
    """menu.json dan mahsulotlarni yuklaydi."""
    if not os.path.exists(MENU_FILE):
        default = {
            "Osh": {"sizes": {"Kichik": 15000, "O'rta": 25000, "Katta": 35000}},
            "Shashlik": {"sizes": {"1 tayoq": 18000, "2 tayoq": 35000}},
            "Lagmon": {"sizes": {"Oddiy": 20000, "Qo'sh": 38000}},
        }
        save_menu(default)
        return default
    with open(MENU_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_menu(menu: dict):
    with open(MENU_FILE, "w", encoding="utf-8") as f:
        json.dump(menu, f, ensure_ascii=False, indent=2)

# ─────────────────────────────────────────────
# SANA LOGIKASI
# ─────────────────────────────────────────────

def get_delivery_options() -> list[str]:
    """
    Soat 12:00 gacha   → Bugun + Ertaga
    Soat 12:00 dan keyin → faqat Ertaga
    """
    now = datetime.now(TZ)
    today_str    = now.strftime("%d.%m.%Y")
    tomorrow     = now + timedelta(days=1)
    tomorrow_str = tomorrow.strftime("%d.%m.%Y")

    if now.hour < 12:
        return [f"📅 Bugun — {today_str}", f"📅 Ertaga — {tomorrow_str}"]
    else:
        return [f"📅 Ertaga — {tomorrow_str}"]

# ─────────────────────────────────────────────
# FSM HOLATLARI
# ─────────────────────────────────────────────

class OrderForm(StatesGroup):
    name    = State()
    phone   = State()
    product = State()
    size    = State()
    date    = State()
    address = State()

class AdminMenu(StatesGroup):
    waiting_menu_json = State()

# ─────────────────────────────────────────────
# YORDAMCHI: klaviatura
# ─────────────────────────────────────────────

def make_kb(buttons: list[str], cols: int = 2) -> ReplyKeyboardMarkup:
    rows = [buttons[i:i+cols] for i in range(0, len(buttons), cols)]
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=b) for b in row] for row in rows],
        resize_keyboard=True
    )

# ─────────────────────────────────────────────
# /START
# ─────────────────────────────────────────────

@dp.message(CommandStart())
async def cmd_start(msg: types.Message, state: FSMContext):
    await state.clear()
    kb = make_kb(["📦 Buyurtma berish", "📋 Menyu ko'rish"], cols=2)
    await msg.answer(
        "Assalomu alaykum! 👋\n\nBuyurtma berish yoki menyuni ko'rish uchun tanlang.",
        reply_markup=kb
    )

# ─────────────────────────────────────────────
# MENYU KO'RISH (foydalanuvchi uchun)
# ─────────────────────────────────────────────

@dp.message(F.text == "📋 Menyu ko'rish")
async def show_menu(msg: types.Message):
    menu = load_menu()
    text = "📋 *Bugungi menyu:*\n\n"
    for product, info in menu.items():
        text += f"*{product}*\n"
        for size, price in info["sizes"].items():
            text += f"  • {size} — {price:,} so'm\n"
        text += "\n"
    await msg.answer(text, parse_mode="Markdown")

# ─────────────────────────────────────────────
# BUYURTMA BOSHLASH
# ─────────────────────────────────────────────

@dp.message(F.text == "📦 Buyurtma berish")
async def start_order(msg: types.Message, state: FSMContext):
    await state.set_state(OrderForm.name)
    await msg.answer("Ismingizni kiriting:", reply_markup=ReplyKeyboardRemove())

@dp.message(OrderForm.name)
async def get_name(msg: types.Message, state: FSMContext):
    await state.update_data(name=msg.text)
    kb = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="📱 Raqamni yuborish", request_contact=True)]],
        resize_keyboard=True
    )
    await state.set_state(OrderForm.phone)
    await msg.answer("Telefon raqamingizni yuboring:", reply_markup=kb)

@dp.message(OrderForm.phone)
async def get_phone(msg: types.Message, state: FSMContext):
    phone = msg.contact.phone_number if msg.contact else msg.text
    await state.update_data(phone=phone)
    await state.set_state(OrderForm.product)

    menu = load_menu()
    products = list(menu.keys())
    kb = make_kb(products, cols=2)
    await msg.answer("Mahsulotni tanlang:", reply_markup=kb)

@dp.message(OrderForm.product)
async def get_product(msg: types.Message, state: FSMContext):
    menu = load_menu()
    if msg.text not in menu:
        await msg.answer("Iltimos, ro'yxatdan mahsulot tanlang.")
        return

    await state.update_data(product=msg.text)
    sizes = list(menu[msg.text]["sizes"].keys())
    prices = menu[msg.text]["sizes"]

    size_buttons = [f"{s} — {prices[s]:,} so'm" for s in sizes]
    kb = make_kb(size_buttons, cols=1)
    await state.set_state(OrderForm.size)
    await msg.answer(f"*{msg.text}* — hajmini tanlang:", reply_markup=kb, parse_mode="Markdown")

@dp.message(OrderForm.size)
async def get_size(msg: types.Message, state: FSMContext):
    data = await state.get_data()
    menu = load_menu()
    product = data["product"]
    sizes = menu[product]["sizes"]

    # "Kichik — 15,000 so'm" → "Kichik" ni ajratib olamiz
    chosen_size = None
    chosen_price = None
    for size, price in sizes.items():
        if msg.text.startswith(size):
            chosen_size = size
            chosen_price = price
            break

    if not chosen_size:
        await msg.answer("Iltimos, ro'yxatdan hajm tanlang.")
        return

    await state.update_data(size=chosen_size, price=chosen_price)

    # Sana tanlash
    options = get_delivery_options()
    kb = make_kb(options, cols=1)
    await state.set_state(OrderForm.date)
    await msg.answer("Yetkazib berish kunini tanlang:", reply_markup=kb)

@dp.message(OrderForm.date)
async def get_date(msg: types.Message, state: FSMContext):
    options = get_delivery_options()
    if msg.text not in options:
        await msg.answer("Iltimos, taklif etilgan kunni tanlang.")
        return

    await state.update_data(delivery_date=msg.text)
    await state.set_state(OrderForm.address)
    await msg.answer("Yetkazib berish manzilini kiriting:", reply_markup=ReplyKeyboardRemove())

@dp.message(OrderForm.address)
async def get_address(msg: types.Message, state: FSMContext):
    await state.update_data(address=msg.text)
    data = await state.get_data()
    await state.clear()

    order_text = (
        f"🆕 *Yangi buyurtma!*\n\n"
        f"👤 Ism: {data['name']}\n"
        f"📱 Telefon: {data['phone']}\n"
        f"📦 Mahsulot: {data['product']} ({data['size']})\n"
        f"💰 Narx: {data['price']:,} so'm\n"
        f"📅 Sana: {data['delivery_date']}\n"
        f"📍 Manzil: {data['address']}\n"
        f"🆔 User ID: {msg.from_user.id}"
    )

    approve_kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Qabul", callback_data=f"approve_{msg.from_user.id}"),
        InlineKeyboardButton(text="❌ Bekor", callback_data=f"reject_{msg.from_user.id}"),
    ]])
    await bot.send_message(ADMIN_ID, order_text, reply_markup=approve_kb, parse_mode="Markdown")
    await msg.answer(
        f"✅ Buyurtmangiz qabul qilindi!\n\n"
        f"📦 {data['product']} ({data['size']}) — {data['price']:,} so'm\n"
        f"📅 {data['delivery_date']}\n\n"
        f"Tez orada bog'lanamiz! 🚀"
    )

# ─────────────────────────────────────────────
# ADMIN: buyurtmani tasdiqlash / bekor qilish
# ─────────────────────────────────────────────

@dp.callback_query(F.data.startswith("approve_"))
async def approve_order(call: types.CallbackQuery):
    user_id = int(call.data.split("_")[1])
    await bot.send_message(user_id, "🎉 Buyurtmangiz tasdiqlandi! Tez orada yetkazib beramiz.")
    await call.message.edit_text(call.message.text + "\n\n✅ *Tasdiqlandi*", parse_mode="Markdown")
    await call.answer("Tasdiqlandi!")

@dp.callback_query(F.data.startswith("reject_"))
async def reject_order(call: types.CallbackQuery):
    user_id = int(call.data.split("_")[1])
    await bot.send_message(user_id, "😔 Afsuski, buyurtmangiz bekor qilindi. Qayta urinib ko'ring.")
    await call.message.edit_text(call.message.text + "\n\n❌ *Bekor qilindi*", parse_mode="Markdown")
    await call.answer("Bekor qilindi.")

# ─────────────────────────────────────────────
# ADMIN: menyu yangilash
# ─────────────────────────────────────────────

@dp.message(Command("admin"))
async def admin_panel(msg: types.Message):
    if msg.from_user.id != ADMIN_ID:
        return
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📋 Menyuni ko'rish", callback_data="admin_view_menu")],
        [InlineKeyboardButton(text="✏️ Menyuni yangilash", callback_data="admin_edit_menu")],
    ])
    await msg.answer("👨‍💼 *Admin panel*", reply_markup=kb, parse_mode="Markdown")

@dp.callback_query(F.data == "admin_view_menu")
async def admin_view_menu(call: types.CallbackQuery):
    if call.from_user.id != ADMIN_ID:
        return
    menu = load_menu()
    text = "📋 *Joriy menyu (JSON):*\n\n```json\n"
    text += json.dumps(menu, ensure_ascii=False, indent=2)
    text += "\n```"
    await call.message.answer(text, parse_mode="Markdown")
    await call.answer()

@dp.callback_query(F.data == "admin_edit_menu")
async def admin_edit_menu(call: types.CallbackQuery, state: FSMContext):
    if call.from_user.id != ADMIN_ID:
        return
    await state.set_state(AdminMenu.waiting_menu_json)
    menu = load_menu()
    example = json.dumps(menu, ensure_ascii=False, indent=2)
    await call.message.answer(
        f"✏️ Yangi menyuni JSON formatida yuboring.\n\n"
        f"Namuna:\n```json\n{example}\n```",
        parse_mode="Markdown"
    )
    await call.answer()

@dp.message(AdminMenu.waiting_menu_json)
async def receive_new_menu(msg: types.Message, state: FSMContext):
    if msg.from_user.id != ADMIN_ID:
        return
    try:
        # ```json ... ``` ichidan ham olinadi
        text = msg.text.strip().strip("```json").strip("```").strip()
        new_menu = json.loads(text)
        save_menu(new_menu)
        await state.clear()
        await msg.answer("✅ Menyu muvaffaqiyatli yangilandi!")
    except json.JSONDecodeError as e:
        await msg.answer(f"❌ JSON xato: {e}\n\nQayta yuboring.")

# ─────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────

async def main():
    print("Bot ishga tushdi ✅")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
