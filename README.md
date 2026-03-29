# Friendslop 3D Multiplayer Platform

Welcome to the Friendslop repository! This is a real-time, 3D multiplayer web application built with modern web technologies, pushing the boundaries of what is possible in the browser. 

The platform features real-time synchronization, physics, and a fast, responsive user interface.

## 🚀 Features

- **Real-Time Multiplayer:** Peer-to-peer state synchronization via WebRTC.
- **3D Physics & Graphics:** Declarative, hardware-accelerated 3D scenes with real physics.
- **Spatial Audio:** Immersive audio environments that react to distance and position.
- **Modern UI:** Unstyled headless components customized with utility-first CSS for a rich, accessible experience.

## 🛠️ Technology Stack & Dependencies

This project relies on a carefully selected stack to deliver a smooth and scalable 3D multiplayer experience:

### Frontend / UI
- **[React 19](https://react.dev/):** The core library used for UI rendering, utilizing the latest React features.
- **[Tailwind CSS v4](https://tailwindcss.com/) & Vite Plugin:** Utility-first CSS framework for rapid UI styling without leaving the component code.
- **[@base-ui/react](https://base-ui.com/):** Unstyled, accessible UI components used as the foundation for the application's complex interactive elements.

### 3D Rendering & Physics
- **[Three.js](https://threejs.org/):** The underlying WebGL library used for all 3D rendering.
- **[@react-three/fiber](https://docs.pmnd.rs/react-three-fiber):** A React renderer for Three.js, allowing us to build complex 3D scenes declaratively with components.
- **[@react-three/drei](https://github.com/pmndrs/drei):** An ecosystem of useful helpers, abstractions, and pre-built components for `@react-three/fiber` (e.g., cameras, environment maps).
- **[@react-three/rapier](https://github.com/pmndrs/react-three-rapier):** React wrapper for the Rapier physics engine, providing robust and performant rigid body dynamics and collision detection for the 3D world.

### Multiplayer & State Synchronization
- **[Yjs](https://yjs.dev/):** A high-performance CRDT (Conflict-free Replicated Data Type) used to manage and seamlessly merge distributed real-time state.
- **[y-webrtc](https://github.com/yjs/y-webrtc):** The WebRTC provider for Yjs, enabling direct peer-to-peer data synchronization to minimize latency.
- **[PartyKit](https://docs.partykit.io/):** Our edge backend platform. It acts as the signaling server for WebRTC handshakes and fallback relay, ensuring players can consistently discover and connect to each other.

### Build & Tooling
- **[Vite](https://vitejs.dev/):** Lightning-fast development server and production bundler.
- **[TypeScript](https://www.typescriptlang.org/):** Provides strict type-safety across the entire codebase to prevent runtime errors and improve developer experience.

## 🏃‍♂️ Local Development

To run the application locally, follow these steps:

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` (comes with Node.js)

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd friendslop-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   This command uses `concurrently` to spin up two processes:
   - The Vite frontend dev server (typically on `http://localhost:5173`)
   - The PartyKit local development server (typically on `http://127.0.0.1:1999`)

4. **Verify it works:**
   Open `http://localhost:5173` in your browser. To test multiplayer locally, open a second tab or window and place them side-by-side.

## 🚢 Deployment

Deploying the application involves two parts: deploying the PartyKit signaling server, and deploying the Vite frontend to a static host.

For comprehensive, step-by-step deployment instructions, please read our **[Deployment Guide](DEPLOYMENT.md)**.

> **Quick Summary:**
> 1. Run `npx partykit deploy` to deploy the backend.
> 2. Create a `.env` file setting `VITE_PARTYKIT_HOST` to your deployed PartyKit URL.
> 3. Build (`npm run build`) and deploy the `dist` folder to a host like Vercel or Netlify.

## 📁 Project Structure

A brief overview of the primary file structure:
- `src/components/` - Contains UI elements and 3D scene objects.
  - `3d/` - Reusable R3F 3D components, characters, physics bodies, lighting.
  - `ui/` - React DOM UI overlays, menus, debugging panels.
- `src/sync/` - Logic for multiplayer synchronization, CRDT setup, WebRTC configuration.
- `src/audio/` - Systems managing spatial audio, UI sounds, and real-time voice chat.
- `party/` - Logic running on the PartyKit edge server (signaling, room management).
- `DEPLOYMENT.md` - Dedicated instructions for cloud deployments.

## 🤝 Contributing

When contributing to this repository, please ensure to:
1. Run `npm run validate` to check types (`tsc`), linting (`eslint`), and formatting (`prettier`) before committing.
2. Adhere to strict TypeScript typing guidelines—no `any` or `!`.
3. Follow the established container/presentational component patterns for the frontend UI.
