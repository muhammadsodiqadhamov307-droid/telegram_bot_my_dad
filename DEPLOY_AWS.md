
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
# Secure the key (Linux/Mac/Git Bash)
chmod 400 new_bot.pem

# Secure the key (Windows CMD/PowerShell)
icacls new_bot.pem /reset
icacls new_bot.pem /grant:r "%USERNAME%":"(R)"
icacls new_bot.pem /inheritance:r

# Connect (Method 1: Terminal)
ssh -i "new_bot.pem" ubuntu@1.2.3.4
# (If that fails with "Permission denied", double check permissions or try Method 2)

## 2a. Connect (Method 2: Browser - EASIEST)
1.  Go to AWS Console -> EC2 -> Instances.
2.  Select your instance `PulNazorat-Server`.
3.  Click **Connect** (top right).
4.  Select **EC2 Instance Connect** tab.
5.  Click **Connect**.
This opens a terminal directly in your browser without needing key files.
```

## 3. Server Setup (Amazon Linux 2023 / 2)
Run these commands one by one:

```bash
# Update system
sudo yum update -y

# Install Git
sudo yum install git -y

# Install Node.js (using NVM)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Install Process Manager (PM2)
npm install -g pm2
```

## 3b. Server Setup (Ubuntu - Optional if you use Ubuntu AMI)
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
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
