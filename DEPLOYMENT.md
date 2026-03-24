# Deploying Friendslop 3D

This application consists of two main parts that need to be deployed:
1. **The Backend (PartyKit)**: Handles WebRTC signaling for multiplayer and chat.
2. **The Frontend (Vite/React)**: The 3D game client.

## Step 1: Deploy the PartyKit Backend

The backend is powered by [PartyKit](https://docs.partykit.io/), which runs on Cloudflare Workers.

1. Open your terminal in the project root (`z:\repos\friendslop-app`).
2. Run the deployment command:
   ```bash
   npx partykit deploy
   ```
3. The CLI will prompt you to log in via GitHub and create a free PartyKit account.
4. Once deployed, PartyKit will output your production URL. 
   It usually looks like: `friendslop-app.<your-github-username>.partykit.dev`
5. Save this URL, as you will need it for the frontend configuration.

## Step 2: Update the Frontend Configuration

Now that your backend is live, you need to tell the frontend where to connect when running in production.

1. Create a `.env` file in the root of your project.
2. Add your PartyKit hostname to the `.env` file based on the URL from Step 1:
   ```env
   VITE_PARTYKIT_HOST=friendslop-app.<your-github-username>.partykit.dev
   ```
3. When deploying the frontend to a hosting provider in the next step, ensure you add `VITE_PARTYKIT_HOST` to their Environment Variables section (e.g. in Vercel or Netlify site settings).

## Step 3: Deploy the Frontend

Because the frontend is a static Vite application, you can deploy it to any static hosting provider like Vercel, Netlify, GitHub Pages, or Cloudflare Pages.

### General Settings for Any Host
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node Version**: 18.x or higher

### Option A: Deploying to Vercel (Recommended)
1. Install the Vercel CLI: `npm i -g vercel` (or deploy via the Vercel website by connecting your GitHub repo).
2. Run the `vercel` command in your project root.
3. Follow the prompts to set up and deploy the project. Accept the default settings for Vite (build command: `npm run build`, output dir: `dist`).
4. Once finished, run `vercel --prod` to deploy to production.

### Option B: Deploying to Netlify
1. Connect your GitHub repository to Netlify via their web dashboard.
2. Set the build command to `npm run build` and output directory to `dist`.
3. Click "Deploy Site".
4. (Optional) If you have routing issues, you may need a `_redirects` file in your `public` folder with `/* /index.html 200`.

### Option C: Deploying to Cloudflare Pages
1. Connect your GitHub repository to Cloudflare Pages via their dashboard.
2. Select "React (Vite)" as the framework preset.
3. The build command will automatically be `npm run build` and the output directory `dist`.
4. Click "Save and Deploy".

## Step 4: Verify

1. Open your frontend production URL in a browser.
2. Open it in a second tab or device.
3. Click to connect. You should see both players in the 3D space and be able to hear audio if microphones are enabled!
