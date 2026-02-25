<div align="center">
  <img src="https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</div>

<h1 align="center">Recomendarr</h1>

<p align="center">
  A self-hosted, AI-powered media recommendation engine that analyzes your watch history and automatically adds personalized movie and TV show recommendations directly to <b>Radarr</b> and <b>Sonarr</b>. 
</p>

## ✨ Features

- **Automated Discovery**: Analyzes your watch history from **Plex**, **Jellyfin**, or **Emby**.
- **Dual Recommendation Engines**: Uses both **TMDb** for related content and **OpenAI** (or compatible LLMs) for deep, personalized AI recommendations.
- **Direct Integration**: Adds approved media straight into Radarr and Sonarr—no Jellyseerr or Overseerr required.
- **Guided Setup Wizard**: A seamless, 4-step first-run onboarding UI to connect all your services in minutes.
- **UI-Driven Configuration**: No complex `.env` files to manage. Settings are editable from a beautiful web interface and persisted in a lightweight SQLite database.

---

## 🚀 Getting Started

Recomendarr is designed to be ridiculously easy to spin up, primarily via Docker. All configuration and API keys are handled entirely through the Web UI during the initial Setup Wizard.

### Option 1: Docker Compose (Recommended)

1. Create a `docker-compose.yml` file:
```yaml
services:
  recomendarr:
    image: dheerajr00/recomendarr:latest
    container_name: recomendarr
    ports:
      - "3000:3000"
    volumes:
      - recomendarr-data:/app/data
    restart: unless-stopped

volumes:
  recomendarr-data:
```

2. Start the container:
```bash
docker-compose up -d
```

### Option 2: Docker CLI (`docker run`)

If you prefer to run the container directly without Compose:
```bash
docker run -d \
  --name recomendarr \
  -p 3000:3000 \
  -v recomendarr-data:/app/data \
  --restart unless-stopped \
  dheerajr00/recomendarr:latest
```

### Option 3: Local Node.js Development
If you want to run from source or contribute to development:

1. Clone the repository:
```bash
git clone https://github.com/dheerajramasahayam/recomendarr.git
cd recomendarr
```
2. Install dependencies:
```bash
npm install
```
3. Start the development server:
```bash
npm run dev
```

---

## ⚙️ Initial Setup Wizard

No matter which deployment method you choose, open your browser and navigate to:
**[http://localhost:3000](http://localhost:3000)**

On your first visit, you will be greeted by the **Setup Wizard**, which will walk you through setting up your ecosystem in 4 easy steps:

1. **Media Server**: Connect Plex, Jellyfin, or Emby to allow Recomendarr to read your Watch History.
2. **Sonarr**: Connect your Sonarr instance for handling TV Series.
3. **Radarr**: Connect your Radarr instance for handling Movies.
4. **AI Recommender (Optional)**: Provide an OpenAI API key (or compatible local LLM URL) for context-aware, hyper-personalized recommendations.

Once setup is complete, settings are permanently saved to the `recomendarr.db` SQLite database inside your Docker volume. 

*If you ever need to change API keys or URLs later, simply click on the **Settings** tab in the app.*

---

## 🏗 Built With
- [Next.js](https://nextjs.org/) (App Router & Server Actions)
- [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) (Zero-config embedded DB)
- [Docker](https://www.docker.com/) (Standalone Next.js output)

## 🤝 Contribution
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/dheerajramasahayam/recomendarr/issues).
