# Stack TBMQ - ThingsBoard MQTT Broker

This stack provides a complete MQTT broker infrastructure using ThingsBoard MQTT Broker (TBMQ), designed for scalable IoT and home automation deployments.

## 📋 What is TBMQ?

ThingsBoard MQTT Broker is an open-source MQTT message broker that facilitates communication between IoT devices and applications. It provides:

- **MQTT Protocol Support**: Full MQTT 3.1.1 and 5.0 protocol support
- **High Performance**: Handles thousands of concurrent connections
- **Scalability**: Built on Kafka for message distribution
- **Web Interface**: Management UI for monitoring and configuration
- **Integration Support**: Advanced integration capabilities for data processing

## 🚀 Deployment

### Prerequisites

Before deploying this stack, ensure you have:

**Docker Network**: The `domotic-network` network must exist, FIRST deploy `stack-docker`

> **Note**: If you've already deployed `stack-docker`, this network is automatically created.


### Step 1: Review Configuration

Open the `docker-compose.yml` file and review the following configurations:

#### Database Configuration

```yaml
environment:
  POSTGRES_DB: thingsboard_mqtt_broker
  POSTGRES_PASSWORD: postgres  # ⚠️ Change this password!
```

**Recommended**: Change the PostgreSQL password to something secure.

#### TBMQ Configuration

```yaml
environment:
  SPRING_DATASOURCE_PASSWORD: postgres  # ⚠️ Must match PostgreSQL password
  SECURITY_MQTT_BASIC_ENABLED: "true"
  TCP_NETTY_MAX_PAYLOAD_SIZE: 1048576
  LISTENER_WS_ENABLED: "true"
```

**Important Settings:**
- `SPRING_DATASOURCE_PASSWORD`: Must match the PostgreSQL password
- `SECURITY_MQTT_BASIC_ENABLED`: Enables username/password authentication for MQTT
- `TCP_NETTY_MAX_PAYLOAD_SIZE`: Maximum MQTT message size (1MB)
- `LISTENER_WS_ENABLED`: Enables WebSocket support for MQTT over WebSocket

#### Network Configuration

The stack connects to two networks:

```yaml
networks:
  - tbmq_backend    # Internal network for services
  - domotic-network     # External network (must exist)
```

### Step 2: Update Passwords (Recommended)

For production deployments, change the default passwords:

1. Update `POSTGRES_PASSWORD` under the `postgres` service
2. Update `SPRING_DATASOURCE_PASSWORD` under the `tbmq` service to match

### Step 3: Deploy the Stack

Navigate to the stack-tbmq directory and start all services:

```bash
cd stack-tbmq
docker compose up -d
```

### Step 4: Verify Deployment

Check that all services are running:

```bash
docker compose ps
```

You should see the following services running:
- `tbmq_postgres` - PostgreSQL database
- `tbmq_kafka` - Apache Kafka
- `tbmq_redis` - Redis cache
- `tbmq` - ThingsBoard MQTT Broker
- `tbmq_ie` - Integration Executor

## 🔌 Accessing TBMQ

### Web Interface

Access the TBMQ web interface at:

```
http://localhost:8083
```

**Default Credentials:**
- Username: `sysadmin@thingsboard.org`
- Password: `sysadmin`

> ⚠️ **Security Warning**: Change the default credentials immediately after first login!

### MQTT Broker Ports

The following ports are exposed:

| Port | Protocol | Description             |
|------|----------|-------------------------|
| 1883 | MQTT     | Standard MQTT protocol  |
| 8083 | HTTP     | Web UI and REST API     |
| 8084 | WebSocket| MQTT over WebSocket     |

### Testing MQTT Connection

You can test the MQTT connection using `mosquitto_pub` or any MQTT client:

```bash
# Subscribe to a test topic
mosquitto_sub -h localhost -p 1883 -t "test/topic" -u "username" -P "password"

# Publish a test message
mosquitto_pub -h localhost -p 1883 -t "test/topic" -m "Hello TBMQ!" -u "username" -P "password"
```

> **Note**: You'll need to create MQTT credentials in the TBMQ web interface first.

## ⚙️ Configuration

### Creating MQTT Credentials

1. Log in to the web interface at `http://localhost:8083`
2. Navigate to **MQTT client credentials**
3. Click **"+"** to add new credentials
4. Set username and password
5. Configure client type (Application or Device)

<br/>

# 🔗 Integration with Domotic AI - IMPORTANT!!

This TBMQ stack is designed to work with the Domotic AI ecosystem:

## MQTT Bridge Configuration - Application Client for Domotic AI

1. Log in to the web interface at `http://localhost:8083`
2. Navigate to **Authentication > Credentials**
3. Click **"+"** to add new credentials
4. Set:
- name: your_name
- Client type: Application
- Credentials type: Basic
- Client ID: your_client_id
- Username: your_username
- Password: your_password
5. Copy the **Client ID** and **Username** and **Password**
6.  Click **Add**
7. Configure Domotic AI MQTT Bridge environment .env variables:

```yaml
# ============================================
# MQTT CONFIGURATION
# ============================================
MQTT_SERVER_API=http://localhost:8083
MQTT_SERVER_WEB_USER=YOUR_WEB_USERNAME
MQTT_SERVER_WEB_PASS=YOUR_WEB_PASSWORD
MQTT_SERVER_BASE=mqtt://localhost
MQTT_PORT=1883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
MQTT_CLIENT_ID=your_client_id
MQTT_CONNECT_TIMEOUT=10000
MQTT_RECONNECT_PERIOD=4000
```

## 📊 Monitoring

### Service Health

Check service health:

```bash
# View all service statuses
docker compose ps

# Check specific service logs
docker compose logs -f tbmq
docker compose logs -f postgres
docker compose logs -f kafka
```

### Resource Usage

Monitor resource consumption:

```bash
docker stats tbmq tbmq_postgres tbmq_kafka tbmq_redis tbmq_ie
```

## 📚 Additional Resources

- [ThingsBoard MQTT Broker Documentation](https://thingsboard.io/docs/mqtt-broker/)
- [MQTT Protocol Specification](https://mqtt.org/)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)

## 🛡️ Security Best Practices

1. **Change Default Passwords**: Update all default credentials
2. **Use TLS/SSL**: Configure SSL for production deployments
3. **Firewall Rules**: Restrict access to necessary ports only
4. **Regular Updates**: Keep all images up to date
5. **Monitor Logs**: Regularly check logs for suspicious activity
6. **Network Isolation**: Keep internal services on the `tbmq_backend` network

---

## 📄 License

This stack configuration is part of the Domotic AI project and is provided as-is for personal and commercial use.
