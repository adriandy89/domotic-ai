<br />
<p align="center">
  <img src="assets/domotic.jpg" width="240" alt="Domotic AI Logo" />
</p>
<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

# Domotic AI

Domotic AI is a comprehensive home automation system designed to manage multiple houses with seamless integration for Zigbee2MQTT. It leverages a powerful stack to provide real-time monitoring, control, and automation of your smart home devices.

## 🚀 Features

- **Multi-House Support**: Manage multiple distinct locations from a single instance.
- **Zigbee2MQTT Integration**: Native support for Zigbee devices via MQTT.
- **Real-time Updates**: Built on an event-driven architecture using NATS and SSE.
- **Scalable Infrastructure**: Containerized with Docker for easy deployment and scaling.

## 🛠️ Tech Stack

- **Framework**: [NestJS](https://nestjs.com/) (Node.js)
- **Database**: [TimescaleDB](https://www.timescale.com/) (PostgreSQL extension for time-series data)
- **Messaging**: [NATS](https://nats.io/)
- **Caching**: [Redis](https://redis.io/)
- **Containerization**: [Docker](https://www.docker.com/) & Docker Compose

## 📋 Prerequisites

Ensure you have the following installed on your system:

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## ⚙️ Configuration

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd domotic-ai
   ```

2. **Environment Setup**:
   Copy the example environment file to create your local configuration.
   ```bash
   cp .env.example .env
   ```
   ### READ INSTRUCTIONS IN .env.example FILE
   Open `.env` and adjust the variables according to your environment (database credentials, NATS URL, etc.).

## 📦 Deployment

You can deploy the system using our batched deployment script (recommended) or manually via Docker Compose.

### Option 1: Batched Deployment (Recommended)

We provide a `deploy-batched.sh` script to streamline the deployment process. It handles:
- Starting infrastructure services (Redis, TimescaleDB, NATS) first.
- Running database migrations.
- Starting the core application services in the correct order.
- Cleaning up unused Docker images.

To use it, simply run:

```bash
./deploy-batched.sh
```

### Option 2: Manual Deployment

If you prefer to control the process manually, follow these steps:

1. **Start the Infrastructure Stack**:
   The infrastructure services are defined in `stack-docker/docker-compose.yml`.

   ```bash
   docker compose -f stack-docker/docker-compose.yml up -d
   ```

2. **Wait for Services**:
   Ensure that TimescaleDB, Redis, and NATS are fully up and running before proceeding.

3. **Start Application Services**:
   Deploy the main application services.

   ```bash
   docker compose up -d
   ```

## 🔍 Monitoring

After deployment, you can check the status of your services:

```bash
docker compose ps
```

To view logs for a specific service:

```bash
docker compose logs -f <service_name>
```

## 🤝 Contribution

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is [GNU AGPL v3 licensed](LICENSE).
