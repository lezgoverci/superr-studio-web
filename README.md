# Superr Studio

Superr Studio is a powerful, visual workflow builder that enables you to design, orchestrate, and automate tasks using AI agents and various third-party integrations. 

By running entirely in your browser but communicating with a **Local AI Agent Bridge**, Superr Studio allows you to utilize your own AI subscriptions (e.g., Gemini, OpenAI, Anthropic, etc.) without requiring costly cloud infrastructure or proxying your API keys through third-party servers.

## Architecture

Superr Studio consists of two main components:
1. **The Web App (Workflow Builder)**: A Next.js visual canvas for designing AI workflows, connecting nodes, and chatting with AI agents.
2. **The Local AI Agent (OpenCode Bridge)**: A lightweight Go daemon running locally on your machine. It hosts an `opencode` server, securely processing your AI requests and running operations directly on your machine.

---

## 🚀 Getting Started

To fully utilize Superr Studio, you need to run both the web interface and the local desktop bridge.

### 1. Starting the Web App

The web application is built with Next.js and uses `pnpm` for package management.

```bash
# Install dependencies
pnpm install

# Discover plugins and start the development server
pnpm run dev
```

The Web App will be accessible at `http://localhost:3000`.

### 2. Installing the Local AI Agent Bridge

For Superr Studio to execute workflows and power the AI chat capabilities securely, you'll need the Local Agent Bridge running. 

You have two ways to install this:

#### Option A: From the Web UI (Recommended)
1. Open Superr Studio at `http://localhost:3000`.
2. Click on the **Settings/Connection** wheel in the top right corner.
3. Click the **"Install Local AI Agent"** button. The app will automatically download the bridge, initialize it, and map your configurations securely.

#### Option B: Manual Terminal Installation
Alternatively, you can run the install script directly from your terminal (macOS / Linux):

```bash
curl -fsSL http://localhost:3000/install-superr-ai.sh | bash
```

The installer will setup the `opencode` server, create a local CORS configuration, and output a **Server URL** and **Auth Token**. You can then enter these details into the Superr Studio connection settings manually.

### 3. Usage

Once both the Web App and Local Agent are running:

1. **Connect:** Open the connection settings in the top right of the Superr Studio interface. If your Local Agent is running, it will automatically detect the secure token and connect.
2. **Setup AI Providers:** Run `opencode auth login` in your terminal to authenticate your AI providers (e.g., Google/Gemini), or supply your API keys (e.g., Anthropic, OpenAI) inside the web app's connection settings.
3. **Build Workflows:** Drag and drop nodes onto the canvas, connect AI agents to integrations (Slack, GitHub, Stripe, etc.), and build powerful automations.

---

## Running the Daemon Manually (Development)

If you are developing or want to run the Go Daemon (`superr-desktop-bridge`) manually from source instead of using the pre-compiled binaries:

1. Clone or navigate to the `superr-desktop-bridge` directory.
2. Ensure you have Go 1.21+ installed.
3. Run the daemon and specify the web app URL you want the "Open App" tray button to point to:

```bash
# Run directly
SUPERR_APP_URL="http://localhost:3000" go run main.go

# Or compile and run the binary
go build -o superr-bridge
SUPERR_APP_URL="http://localhost:3000" ./superr-bridge
```

The daemon will start on `127.0.0.1:32156` and a Superr icon will appear in your OS system tray.

---

## Technical Details

- **Frontend:** Next.js (React), TailwindCSS, `reactflow` for the workflow canvas.
- **Backend/Bridge:** Go (Golang) tray daemon orchestrating `opencode-ai`.
- **Integrations:** Plug-and-play architecture for rapidly adding new integrations (e.g., `bash`, `github`, `stripe`, `slack`).
- **Docs index:** Start with [`docs/README.md`](./docs/README.md) for repo-level technical documentation and product-surface implementation docs.

For detailed documentation on the underlying operations, explore the `/components/ai-elements` and `hooks/use-opencode.ts` directories.
