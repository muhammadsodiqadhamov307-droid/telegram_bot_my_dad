
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

## 7. Get a FREE Domain & Setup HTTPS (Required for WebApp)

Telegram WebApps **require** HTTPS. We will use **DuckDNS** (free) and **Nginx** (web server) to set this up.

### A. Get a Free Domain (DuckDNS)
1.  Go to [duckdns.org](https://www.duckdns.org/).
2.  Sign in (with Google/GitHub).
3.  In the **Sub domain** box, type a name (e.g., `my-finance-bot`) and click **add domain**.
4.  It will create `my-finance-bot.duckdns.org`.
5.  **Copy your Public IP** (`44.220.49.92` or whatever AWS gave you).
6.  Paste it into the **current ip** field on DuckDNS and click **update ip**.

### B. Install Nginx & Certbot on Amazon Linux 2023
Run these commands on your server:

```bash
# 1. Install Nginx & Python dependencies
sudo dnf install -y nginx augeas-libs python3-pip

# 2. Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 3. Install Certbot (SSL Tool) using pip (Standard for AL2023)
sudo python3 -m venv /opt/certbot/
sudo /opt/certbot/bin/pip install --upgrade pip
sudo /opt/certbot/bin/pip install certbot certbot-nginx
sudo ln -s /opt/certbot/bin/certbot /usr/bin/certbot
```

### C. Configure Nginx
We need to forward traffic from the domain to your bot (port 3000).

1.  Create a config file (replace `YOUR_DOMAIN` with your duckdns address, e.g., `pulnazorat.duckdns.org`):
    ```bash
    sudo nano /etc/nginx/conf.d/bot.conf
    ```
    *(Note: On Amazon Linux, we use `/etc/nginx/conf.d/`)*

2.  Paste this code (Right-click to paste):
    ```nginx
    server {
        server_name YOUR_DOMAIN.duckdns.org;

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
    *Replace `YOUR_DOMAIN.duckdns.org` with your actual domain `finance-bot-fast.duckdns.org`.*

3.  Save and exit (`Ctrl+X`, `Y`, `Enter`).

4.  Reload Nginx:
    ```bash
    sudo nginx -t     # Test config (should say OK)
    sudo systemctl reload nginx
    ```

### D. Enable HTTPS (SSL)
Run this command to automatically get an SSL certificate:

```bash
sudo certbot --nginx -d YOUR_DOMAIN.duckdns.org
```
-   Enter your email (for renewal alerts).
-   Agree to terms (`Y`).
-   If asked to redirect HTTP to HTTPS, choose **2 (Redirect)**.

**Success!** Your bot is now accessible at `https://YOUR_DOMAIN.duckdns.org`.

### E. Final Configuration
1.  Update `.env` in your bot folder:
    ```bash
    nano .env
    ```
    Set `WEBAPP_URL=https://YOUR_DOMAIN.duckdns.org`
    
2.  Restart the bot:
    ```bash
    pm2 restart pulnazorat
    ```
