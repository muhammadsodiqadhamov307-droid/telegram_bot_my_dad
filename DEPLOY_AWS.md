
# Deployment Guide - Amazon AWS (EC2)

This guide explains how to deploy the PulNazorat bot to an Amazon EC2 instance.

## 1. Launch EC2 Instance
1.  Log in to AWS Console.
2.  Go to **EC2** -> **Launch Instance**.
3.  Name: `PulNazorat-Server`.
4.  AMI: **Ubuntu Server 24.04 LTS** (Free Tier eligible).
5.  Instance Type: **t2.micro** or **t3.micro** (Free Tier).
6.  Key Pair: Create new (e.g., `pulnazorat-key`) and download the `.pem` file.
7.  Network Settings:
    - Allow SSH traffic from anywhere (0.0.0.0/0).
    - Allow HTTP (80) and HTTPS (443).

## 2. Connect to Server
Open your terminal (or PowerShell) where the `.pem` key is located:
```bash
# Secure the key
chmod 400 pulnazorat-key.pem

# Connect (replace 1.2.3.4 with your EC2 Public IP)
ssh -i "pulnazorat-key.pem" ubuntu@1.2.3.4
```

## 3. Server Setup
Run these commands on the server:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Git and Process Manager (PM2)
sudo apt install -y git
sudo npm install -g pm2
```

## 4. Deploy Code
```bash
# Clone repository
git clone https://github.com/muhammadsodiqadhamov307-droid/telegram_bot_my_dad.git
cd telegram_bot_my_dad

# Install dependencies
npm install

# Build Frontend
npm run build
```

## 5. Configure Environment
Create the `.env` file:
```bash
nano .env
```
Paste your variables (Right-click to paste):
```env
BOT_TOKEN=your_bot_token
GEMINI_API_KEY=your_gemini_key
WEBAPP_URL=https://your-public-ip-or-domain
PORT=3000
```
Press `Ctrl+X`, then `Y`, then `Enter` to save.

## 6. Start Application
```bash
# Start with PM2
pm2 start bot.js --name pulnazorat

# Save PM2 list to resurrect on reboot
pm2 save
pm2 startup
```

## 7. Setup Domain & HTTPS (Optional but Recommended)
For the Telegram Web App to work properly, you need HTTPS.
1.  Buy a domain (or use a free one like DuckDNS).
2.  Point the domain to your EC2 IP.
3.  Install Nginx and Certbot:
    ```bash
    sudo apt install -y nginx certbot python3-certbot-nginx
    ```
4.  Configure Nginx Proxy (to port 3000) and run:
    ```bash
    sudo certbot --nginx -d yourdomain.com
    ```
