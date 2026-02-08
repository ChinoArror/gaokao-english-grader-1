<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Gaokao English Grader - Cloudflare Worker Edition

This application is now designed to be deployed on **Cloudflare Workers**. It includes a secure backend proxy to protect your API keys and handle requests to the Gemini API.

## 🚀 Deployment Instructions

### Prerequisites
1. **Node.js**: Ensure Node.js is installed.
2. **Cloudflare Account**: You need a Cloudflare account.
3. **Wrangler**: The Cloudflare CLI tool.

### Setup

1. **Install Dependencies**:
   ```bash
   npm install
   npm install -D wrangler @cloudflare/workers-types
   ```

2. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

3. **Configure Secrets**:
   Set your sensitive environment variables securely:
   ```bash
   npx wrangler secret put API_KEY
   # Enter your Gemini API Key when prompted
   ```

4. **Deploy**:
   ```bash
   npm run build
   npx wrangler deploy
   ```

   This command will:
   - Build the React frontend to the `dist` folder.
   - Deploy the worker (`worker/index.ts`).
   - Upload the static assets from `dist`.
   - Bind the worker to the custom domain `eng.aryuki.com` (configured in `wrangler.toml`).

## 🛠 Configuration

Deployment configuration is managed in `wrangler.toml`.

- **API Domain**: Can be adjusted in `wrangler.toml` (`[vars] API_DOMAIN`) or via Cloudflare Dashboard.
- **Model Name**: Default is `gemini-1.5-flash`. Can be changed in `wrangler.toml` or Dashboard.
- **Custom Domain**: `eng.aryuki.com` is set in `wrangler.toml`. Ensure this domain is active in your Cloudflare account.

## 💻 Local Development

1. **Start Development Server**:
   ```bash
   npm run dev
   ```
   *Note: Local development still runs the frontend. To test the worker logic locally with full emulation, keep reading.*

2. **Preview (Production-like)**:
   ```bash
   npm run build
   npx wrangler dev
   ```
   This emulates the Cloudflare Worker environment locally.

## Project Structure
- **src/**: React Frontend.
- **worker/**: Backend logic (API proxy) running on Cloudflare.
- **dist/**: Production build artifacts (Frontend).

---
*This project was migrated from Google Cloud to Cloudflare Workers.*
