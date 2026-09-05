import { PHYSICS_PRIORITY } from "@/gameplay/frameOrder";
import { DiscWristIndicator } from "@/games/discGolf/DiscWristIndicator";
import { DiscGolfCourse } from "@/games/discGolf/DiscGolfCourse";
import { DiscGolfHUD } from "@/games/discGolf/DiscGolfScores";
import { useRef, useState, useEffect, useCallback, type JSX } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { Perf } from "r3f-perf";
import { Physics } from "@react-three/rapier";
import { SchoolEnvironment } from "@/components/3d/SchoolEnvironment/SchoolEnvironment";
import { FirstPersonPlayer } from "@/games/FirstPersonPlayer";
import { BasketballRules } from "@/games/basketball/BasketballRules";
import { RemotePlayers } from "@/components/3d/RemotePlayers/RemotePlayers";
import { EquipmentProvider } from "@/gameplay/EquipmentContext";
import { EquipmentSync } from "@/gameplay/EquipmentSync";
import { SyncTicker } from "@/components/3d/SyncTicker/SyncTicker";
import { CRTRenderer } from "@/components/3d/CRTRenderer/CRTRenderer";
import { PartlyCloudySky } from "@/components/3d/PartlyCloudySky/PartlyCloudySky";
import { GameMenu } from "@/components/GameMenu/GameMenu";
import { ChatOverlay } from "@/components/ChatOverlay/ChatOverlay";
import { Reticle } from "@/components/HUD/Reticle/Reticle";
import { TargetingManager } from "@/targeting/TargetingManager";
import { usePointerLock } from "@/hooks/usePointerLock";
import { CRT_TARGET_HEIGHT } from "@/constants/render";
import { gameConfig, subscribeToConfig } from "@/config";
import { useActiveDevice, inputManager } from "@/input/useInput";

import css from "./Game.module.css";

type UiMode = "playing" | "chat" | "menu";

const IDLE_CURSOR_TIMEOUT_MS = 3000;

function PostProcessingWrapper(): JSX.Element {
  const scanlines = gameConfig.renderHeight / 6;
  return <CRTRenderer scanlines={scanlines} />;
}

function RenderResolution(): null {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const update = (): void => {
      const targetHeight = gameConfig.crtEnabled
        ? gameConfig.renderHeight
        : CRT_TARGET_HEIGHT;
      gl.setPixelRatio(targetHeight / window.innerHeight);
    };
    update();
    const unsubConfig = subscribeToConfig(update);
    window.addEventListener("resize", update);
    return (): void => {
      unsubConfig();
      window.removeEventListener("resize", update);
    };
  }, [gl]);

  return null;
}

export function Game(): JSX.Element {
  const gameContainerRef = useRef<HTMLCanvasElement>(null);
  const { locked, setPointerLockOnElement } = usePointerLock();
  const [mode, setMode] = useState<UiMode>("menu");
  const modeRef = useRef<UiMode>(mode);
  const activeDevice = useActiveDevice();
  const [isCursorHidden, setIsCursorHidden] = useState(false);

  const [, tick] = useState(0);

  const switchMode = useCallback((newMode: UiMode): void => {
    modeRef.current = newMode;
    setMode(newMode);
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    return subscribeToConfig(() => tick((n) => n + 1));
  }, []);

  const shouldHideCursor =
    isCursorHidden && mode === "playing" && activeDevice === "gamepad";

  // Hide mouse cursor after 3 seconds of mouse inactivity when gamepad is active in-game
  useEffect(() => {
    if (mode !== "playing" || activeDevice !== "gamepad") {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const startIdleTimer = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setIsCursorHidden(true);
      }, IDLE_CURSOR_TIMEOUT_MS);
    };

    const handleMouseMove = (): void => {
      setIsCursorHidden(false);
      startIdleTimer();
    };

    startIdleTimer();

    window.addEventListener("mousemove", handleMouseMove);
    return (): void => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("mousemove", handleMouseMove);
      setIsCursorHidden(false);
    };
  }, [mode, activeDevice]);

  // Lock reconciliation from external pointerlockchange DOM event
  // Drops to menu only when active device is keyboard/mouse
  useEffect(() => {
    const handlePointerLockChange = (): void => {
      const isLocked = Boolean(document.pointerLockElement);
      if (!isLocked) {
        if (
          modeRef.current === "playing" &&
          inputManager.getActiveDevice() === "keyboard"
        ) {
          switchMode("menu");
        }
      } else {
        if (modeRef.current !== "playing") {
          switchMode("playing");
        }
      }
    };

    document.addEventListener("pointerlockchange", handlePointerLockChange);
    return (): void => {
      document.removeEventListener(
        "pointerlockchange",
        handlePointerLockChange,
      );
    };
  }, [switchMode]);

  // Capture-phase keydown for playing mode (Enter -> chat, Escape -> menu)
  useEffect(() => {
    if (mode !== "playing") return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchMode("chat");
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchMode("menu");
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return (): void => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [mode, switchMode]);

  // Gamepad / Action-based menu toggle (e.g. Start button)
  useEffect(() => {
    let raf: number;
    const checkMenuAction = (): void => {
      if (inputManager.justPressed("menu")) {
        if (modeRef.current === "playing") {
          switchMode("menu");
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        } else if (modeRef.current === "menu") {
          switchMode("playing");
          if (
            inputManager.getActiveDevice() === "keyboard" &&
            gameContainerRef.current
          ) {
            setPointerLockOnElement(gameContainerRef.current);
          }
        }
      }
      raf = requestAnimationFrame(checkMenuAction);
    };
    raf = requestAnimationFrame(checkMenuAction);
    return (): void => cancelAnimationFrame(raf);
  }, [setPointerLockOnElement, switchMode]);

  const handleContainerClick = (): void => {
    if (
      modeRef.current === "playing" &&
      !locked &&
      gameContainerRef.current &&
      inputManager.getActiveDevice() === "keyboard"
    ) {
      setPointerLockOnElement(gameContainerRef.current);
    }
  };

  const handleChatClose = useCallback((): void => {
    switchMode("playing");
    if (
      gameContainerRef.current &&
      inputManager.getActiveDevice() === "keyboard"
    ) {
      setPointerLockOnElement(gameContainerRef.current);
    }
  }, [setPointerLockOnElement, switchMode]);

  const handleMenuOpenChange = useCallback(
    (open: boolean): void => {
      if (!open) {
        switchMode("playing");
        if (
          gameContainerRef.current &&
          inputManager.getActiveDevice() === "keyboard"
        ) {
          setPointerLockOnElement(gameContainerRef.current);
        }
      } else {
        switchMode("menu");
      }
    },
    [setPointerLockOnElement, switchMode],
  );

  return (
    <div
      className={`${css.gameContainer} ${shouldHideCursor ? css.hideCursor : ""}`}
      onClick={handleContainerClick}
    >
      <Canvas
        shadows
        camera={{ position: [0, 2, 0], fov: 75 }}
        id="game-container"
        ref={gameContainerRef}
      >
        <RenderResolution />
        <PartlyCloudySky />
        <EquipmentProvider>
          <BasketballRules>
            <Physics gravity={[0, -9.81, 0]} updatePriority={PHYSICS_PRIORITY}>
              <TargetingManager />
              <SchoolEnvironment />
              <DiscGolfCourse />
              <FirstPersonPlayer active={mode === "playing"} />
              <RemotePlayers />
              <EquipmentSync />
              <SyncTicker />
            </Physics>
          </BasketballRules>
        </EquipmentProvider>
        {(gameConfig.crtEnabled || gameConfig.ditherEnabled) && (
          <PostProcessingWrapper />
        )}
        {gameConfig.showFps && <Stats className={css.stats} />}
        {gameConfig.showPerf && <Perf position="top-left" />}
      </Canvas>

      <Reticle />
      <DiscGolfHUD />
      <DiscWristIndicator />

      {/* Controls Hint - Device aware */}
      <div className={css.controls}>
        {activeDevice === "gamepad" ? (
          <>
            Left Stick · Move
            <br />
            L3 · Sprint
            <br />
            X · Pick Up
            <br />
            Hold RT · Charge Throw
          </>
        ) : (
          <>
            WASD · Move
            <br />
            Shift · Sprint
            <br />
            E · Pick Up
            <br />
            Hold Q · Charge Throw
          </>
        )}
      </div>

      {/* Throw charge meter - visibility and fill driven imperatively by PlayerController */}
      <div
        id="throw-meter"
        className={css.throwMeter}
        style={{ display: "none" }}
      >
        <div className={css.throwMeterFillContainer}>
          <div
            id="throw-meter-fill"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "0%",
              borderRadius: 0,
              background: "hsl(120, 90%, 45%)",
            }}
          />
        </div>
      </div>

      <ChatOverlay
        active={mode === "chat"}
        onClose={handleChatClose}
        isMenuOpen={mode === "menu"}
      />

      <GameMenu open={mode === "menu"} onOpenChange={handleMenuOpenChange} />
    </div>
  );
}
