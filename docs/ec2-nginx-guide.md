# EC2 Deployment Guide with Nginx

This document explains how to deploy the Coding Agent MCP Server to an AWS EC2 instance using an Nginx reverse proxy. The setup mirrors the Cloudflare tunnel workflow but exposes a stable domain hosted on your server.

## 1. Launch an EC2 Instance

1. Create an Ubuntu or Amazon Linux instance.
2. Open ports `80` and `443` in the security group for HTTP/HTTPS access.
3. Add port `3000` (or your custom `PORT`) for internal access if required.

## 2. Install Dependencies

```bash
sudo apt update && sudo apt install -y docker.io docker-compose nginx git
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

## 3. Clone the Repository

```bash
git clone https://github.com/MediaBlackout/systemprompt-code-orchestrator.git
cd systemprompt-code-orchestrator
npm install
```

## 4. Configure Environment

Create a `.env` file based on `.env.example` and set any paths specific to your instance.

```bash
cp .env.example .env
# edit PORT, HOST_FILE_ROOT, etc.
```

## 5. Start the Server

```bash
npm run setup
npm start
```

Alternatively run the Docker version:

```bash
docker-compose up -d
```

## 6. Configure Nginx

Point Nginx to the MCP server running on the instance.

```nginx
server {
    listen 80;
    server_name your.domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Reload Nginx to apply the configuration:

```bash
sudo nginx -t && sudo systemctl restart nginx
```

Your MCP server will now be reachable at `http(s)://your.domain.com/mcp`.

## 7. TLS (Optional)

Use `certbot` or another method to obtain an SSL certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
```

This will automatically configure HTTPS.

---

With this setup you can run the Coding Agent directly on an EC2 instance without relying on Cloudflare Tunnel. Traffic flows through Nginx which forwards requests to the MCP server running on port `3000` (or your configured port).
