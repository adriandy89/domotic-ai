# Stack Client - Docker Setup Guide

This repository contains the Docker stack for running the home automation client infrastructure. Follow the steps below to deploy each service.

## 📋 Prerequisites

Before starting, ensure you have:
- Docker Engine installed
- Docker Compose installed
- A Zigbee USB dongle (e.g., Sonoff Zigbee 3.0 USB Dongle Plus)
- MQTT broker accessible (for Zigbee2MQTT)

## 🚀 Quick Start

The deployment consists of three main components:
1. **Zigbee2MQTT** (Required) - Zigbee device management
2. **Portainer** (Optional) - Docker container management UI
3. **Cloudflare Tunnel** (Optional) - Remote access via Cloudflare

---

## 1️⃣ Zigbee2MQTT Setup (Required)

Zigbee2MQTT acts as a bridge between your Zigbee devices and MQTT.

### Step 1: Identify Your Zigbee Dongle

First, plug in your Zigbee USB dongle and identify its device path:

```bash
ls -l /dev/serial/by-id/
```

You should see output similar to:
```
usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_XXXXXXXX-if00-port0
```

### Step 2: Update Docker Compose Configuration

Edit the Zigbee docker-compose file:

```bash
cd zigbee
nano docker-compose.yml
```

Update the device path on line 17 to match your actual dongle:

```yaml
devices:
  - /dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_XXXXXXXX-if00-port0:/dev/ttyUSB0
```

### Step 3: Configure Zigbee2MQTT

Edit the configuration file:

```bash
nano zigbee2mqtt-data/configuration.yaml
```

<br/>


### Update the following settings with values from Domotic-AI application:
   ## ⚠️ YOU MUST GET CONFIGURATION FROM DOMOTIC-AI APPLICATION ⚠️
- **MQTT Server**: Update with MQTT broker details
  ```yaml
  mqtt:
    server: mqtt://your-mqtt-server.com:1883
    user: your-username
    password: your-password
    client_id: your-client-id
    base_topic: home/id/your-topic
  ```

### **Frontend Auth Token**: Change the default auth token
  ```yaml
  frontend:
    auth_token: your-secure-token-here
  ```

### **Network Key**: Generate a new secure network key or keep `GENERATE` for auto-generation
  ```yaml
  advanced:
    network_key: GENERATE
    last_seen: epoch
  ```

### Step 4: Start Zigbee2MQTT

Launch the Zigbee2MQTT service:

```bash
docker compose up -d
```

Verify the service is running:

```bash
docker compose logs -f
```

### Step 5: Access Zigbee2MQTT Web Interface

Open your browser and navigate to:
```
http://localhost:8080
```

You'll be prompted to enter the auth token you configured in step 3.

---

## 2️⃣ Portainer Setup (Optional)

Portainer provides a web-based UI for managing Docker containers.

### Step 1: Navigate to Portainer Directory

```bash
cd ../portainer
```

### Step 2: Start Portainer

```bash
docker compose up -d
```

### Step 3: Access Portainer

Open your browser and navigate to:
```
http://localhost:9000
```

On first access, you'll be prompted to create an admin account.

### Step 4: Monitor Your Stack

Once logged in, you can:
- View all running containers
- Check logs and resource usage
- Manage the Zigbee2MQTT container
- Monitor the `zigbee` network

---

## 3️⃣ Cloudflare Tunnel Setup (Optional)

Cloudflare Tunnel allows you to securely access your services remotely without opening ports on your router.

### Step 1: Create a Cloudflare Tunnel

1. Log in to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access** → **Tunnels**
3. Click **Create a tunnel**
4. Choose **Cloudflared** and give it a name
5. Copy the tunnel token (it looks like: `eyJhIjoiXXXXXX...`)

### Step 2: Update Compose Configuration

Edit the Cloudflare compose file:

```bash
cd ../cloudflare
nano compose.yml
```

Replace the placeholder token on line 5 with your actual tunnel token:

```yaml
command: tunnel --no-autoupdate run --token YOUR_ACTUAL_TOKEN_HERE
```

### Step 3: Configure Tunnel Routes

Back in the Cloudflare dashboard, configure public hostnames:

Example routes:
- `zigbee.yourdomain.com` → `http://zigbee2mqtt:8080`
- `portainer.yourdomain.com` → `http://portainer:9000`

### Step 4: Start Cloudflare Tunnel

```bash
docker compose up -d
```

Verify the tunnel is connected:

```bash
docker compose logs -f
```

You should see: `Connection registered` and `Registered tunnel connection`

### Step 5: Access Remotely

You can now access your services from anywhere:
- `https://zigbee.yourdomain.com`
- `https://portainer.yourdomain.com`

---

## 🔧 Network Architecture

All services are connected via the `zigbee` Docker network:

```
┌─────────────────┐
│  Zigbee2MQTT    │ (Creates the zigbee network)
│  Port: 8080     │
└────────┬────────┘
         │
         ├─────────┐
         │         │
┌────────▼────┐   ┌▼──────────────┐
│  Portainer  │   │  Cloudflared  │
│  Port: 9000 │   │  (Tunnel)     │
└─────────────┘   └───────────────┘
```

The Zigbee2MQTT service must be started **first** as it creates the network that other services depend on.

---

## 📝 Maintenance & Troubleshooting

### View Logs

For any service, navigate to its directory and run:
```bash
docker compose logs -f
```

### Restart a Service

```bash
docker compose restart
```

### Stop a Service

```bash
docker compose down
```

### Update Images

```bash
docker compose pull
docker compose up -d
```

### Common Issues

**Issue**: Zigbee dongle not detected
- Solution: Check the device path with `ls -l /dev/serial/by-id/`
- Ensure your user has permissions: `sudo usermod -aG dialout $USER` (requires logout)

**Issue**: Portainer cannot connect to Zigbee network
- Solution: Ensure Zigbee2MQTT is running first to create the network
- Check network exists: `docker network ls | grep zigbee`

**Issue**: Cloudflare tunnel not connecting
- Solution: Verify your token is correct
- Check tunnel status in Cloudflare dashboard
- Ensure the tunnel name matches

---

## 🛡️ Security Recommendations

1. **Change default tokens**: Update all default authentication tokens
2. **Use strong passwords**: For MQTT and Portainer
3. **Network key**: Generate a secure network key for Zigbee
4. **Cloudflare Access**: Consider adding Cloudflare Access policies for additional security
5. **Regular updates**: Keep Docker images updated

---

## 📚 Additional Resources

- [Zigbee2MQTT Documentation](https://www.zigbee2mqtt.io/)
- [Portainer Documentation](https://docs.portainer.io/)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)

---

## 📄 License

This stack configuration is provided as-is for personal use.
