# 🏠 Domotic AI - Web Dashboard

<p align="center">
  <img src="../assets/domotic.jpg" width="240" alt="Domotic AI Logo" />
</p>

Modern and futuristic frontend for intelligent home management built with cutting-edge technologies.

![Tech Stack](https://skillicons.dev/icons?i=react,vite,ts,tailwind,figma)

## 🚀 Technologies

| Category          | Technology                                        |
| ----------------- | ------------------------------------------------- |
| **Core**          | React 19 + TypeScript + Vite 7                    |
| **Styles**        | Tailwind CSS v4 (CSS-first engine)                |
| **State**         | Zustand (Global state & Persistence)              |
| **Routing**       | React Router DOM v7                               |
| **UI/UX**         | Lucide React (Icons) + Framer Motion (Animations) |
| **HTTP**          | Axios with auth interceptors                      |
| **Notifications** | Sonner (Toast notifications)                      |

## ✨ Features

### 🔐 Robust Authentication

- OAuth support (Google, GitHub, Microsoft)
- Secure session management with JWT
- Protected routes with automatic redirects

### 🎨 Advanced Theming

- Light/Dark (_Solar/Lunar_) theme system
- Persistence and auto-detection based on system preferences
- Built on native CSS variables and data attributes

### 📱 Responsive Design

- **Desktop**: Collapsible sidebar with smooth transitions
- **Mobile**: Touch-friendly drawer menu and optimized header

### 💎 Premium UI

- _Glassmorphism_ aesthetic with vivid gradients
- Interactive components with micro-animations
- Real-time updates via SSE (Server-Sent Events)

### 🤖 AI Integration

- Built-in AI chatbox assistant
- Voice input support with Web Speech API
- Multi-language voice recognition

### 🏠 Smart Home Control

- Multi-house management
- Device control and monitoring
- Real-time sensor data visualization
- Automation rules management
- Management of homes, users and devices
- Notifications

---

## 📸 Screenshots

<p align="center">
  <img src="../assets/front/1.png" width="600" alt="Screenshot 1" />
</p>

<p align="center">
  <img src="../assets/front/front-dark.png" width="600" alt="Screenshot Dark" />
</p>

<p align="center">
  <img src="../assets/front/2.png" width="600" alt="Screenshot 2" />
</p>

<p align="center">
  <img src="../assets/front/3.png" width="600" alt="Screenshot 3" />
</p>

<p align="center">
  <img src="../assets/front/4.png" width="600" alt="Screenshot 4" />
</p>

<p align="center">
  <img src="../assets/front/5.png" width="600" alt="Screenshot 5" />
</p>

<p align="center">
  <img src="../assets/front/6.png" width="600" alt="Screenshot 6" />
</p>

<p align="center">
  <img src="../assets/front/7.png" width="600" alt="Screenshot 7" />
</p>

<p align="center">
  <img src="../assets/front/8.png" width="600" alt="Screenshot 8" />
</p>

<p align="center">
  <img src="../assets/front/9.png" width="600" alt="Screenshot 9" />
</p>

<p align="center">
  <img src="../assets/front/10.png" width="600" alt="Screenshot 10" />
</p>

<p align="center">
  <img src="../assets/front/11.png" width="600" alt="Screenshot 11" />
</p>

<p align="center">
  <img src="../assets/front/12.png" width="600" alt="Screenshot 12" />
</p>

<p align="center">
  <img src="../assets/front/13.png" width="600" alt="Screenshot 13" />
</p>

<p align="center">
  <img src="../assets/front/14.png" width="600" alt="Screenshot 14" />
</p>

<p align="center">
  <img src="../assets/front/15.png" width="600" alt="Screenshot 15" />
</p>

<p align="center">
  <img src="../assets/front/16.png" width="600" alt="Screenshot 16" />
</p>

<p align="center">
  <img src="../assets/front/17.png" width="600" alt="Screenshot 17" />
</p>

---

## 🛠️ Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

```

## ⚙️ Configuration

Ensure your `.env` file is configured:

```env
VITE_API_URL=http://localhost:3017/api/v1
```

## 📁 Project Structure

```
web/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Route-based page components
│   ├── store/          # Zustand state management
│   ├── lib/            # Utilities and API client
│   ├── assets/         # Static assets
│   ├── App.tsx         # Main application component
│   └── main.tsx        # Entry point
├── public/             # Public static files
└── index.html          # HTML template
```

## 🐳 Docker Deployment

Build and run with Docker Compose:

```bash
docker compose up -d
```

---

_Domotic AI © 2025_
