
# PulNazorat - Shaxsiy Moliya Telegram Boti 🇺🇿

O'zbek tilidagi qulay va sodda shaxsiy moliya boshqaruvchisi. Telegram bot va zamonaviy Web App orqali daromad va xarajatlaringizni nazorat qiling.

## Xususiyatlari

- 🗣 **Ovozli Xarajatlar**: Xarajatlarni shunchaki ovozli xabar yuborish orqali qo'shing (Gemini AI yordamida).
- 📱 **Web App**: Chiroyli va qulay interfeys orqali balans va tarixni ko'rish.
- 📊 **PDF Hisobotlar**: Istalgan vaqtda to'liq hisobot yuklab olish.
- 🇺🇿 **To'liq O'zbek tilida**.

## O'rnatish

1. **Repozitoriyni yuklab oling:**
   ```bash
   git clone https://github.com/yourusername/pulnazorat.git
   cd pulnazorat
   ```

2. **Kutubxonalarni o'rnating:**
   ```bash
   npm install
   ```

3. **.env faylini sozlang:**
   `.env.example` faylidan nusxa oling va `.env` deb nomlang. Ichiga o'z ma'lumotlaringizni kiriting:
   ```env
   BOT_TOKEN=sizning_bot_tokeningiz
   GEMINI_API_KEY=sizning_gemini_kalitingiz
   WEBAPP_URL=https://sizning-domeningiz.com
   ```

4. **Dasturni ishga tushiring:**

   **Rivojlantirish rejimi (Development):**
   ```bash
   npm run dev    # Vite serveri (frontend)
   npm start      # Bot serveri (backend) - alohida terminalda
   ```

   **Production rejimi:**
   ```bash
   npm run build  # Frontendni qurish
   npm start      # Serverni ishga tushirish
   ```

## Deploy qilish (Heroku/Railway/Vercel)

Bu loyiha **Node.js** serveri + **React** frontendidan iborat. Eng oson yo'li:

1. **Railway yoki Render** kabi xizmatlardan foydalaning.
2. `Build Command`: `npm run build`
3. `Start Command`: `npm start`
4. Environment o'zgaruvchilarni (BOT_TOKEN, va h.k.) kiriting.
5. Olingan URL manzilini `.env` faylidagi `WEBAPP_URL` ga yozing.
6. Telegramda @BotFather orqali botni sozlang:
   - `/setmenubutton` -> Link to Web App -> Yaratgan URL manzilingizni kiriting.

## Texnologiyalar

- **Frontend**: React, Tailwind CSS, Vite
- **Backend**: Node.js, Express, Telegraf.js
- **Database**: SQLite
- **AI**: Gemini 1.5 Flash (Google Generative AI)
- **PDF**: PDFKit

## Muallif

[Sizning Ismingiz]
