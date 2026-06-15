"use client";

import { useEffect, useRef } from "react";

/* -------------------------------------------------------------------------- *
 *  Verana Foundation hero — animated 3D trust-graph background.
 *
 *  Zero dependencies. Canvas 2D + a hand-rolled perspective projection, so
 *  we get a real 3D scene without paying the ~180 kB bundle tax of
 *  Three.js / react-three-fiber. Runtime is ~4 kB gzipped.
 *
 *  Scene:
 *    - ~10 hex agent nodes distributed in a 3D cloud, not on a flat plane.
 *    - ~28 threads converge onto them from off-world anchors at varied
 *      depths; particles travel along curved paths in world space, then
 *      get projected to screen each frame.
 *    - Base scene drifts slowly on yaw/pitch (orbital idle motion).
 *    - Mouse position adds parallax yaw/pitch on top (lerped for smoothness).
 *    - Vertical scroll adds a subtle extra pitch while the hero is in view.
 *    - Depth fog fades distant geometry (cheap DOF substitute).
 *
 *  Rebranded to the Verana Foundation palette (purple primary, green
 *  secondary, indigo support) and made theme-aware: the Foundation site is
 *  LIGHT-first (theme is driven by `data-theme` on <html>, not Tailwind's
 *  `dark:` variant). On dark backgrounds we use additive ("lighter")
 *  compositing for a real neon glow; on light backgrounds that would clamp
 *  to white and vanish, so we fall back to "source-over" with punchier
 *  alpha. A MutationObserver re-reads the theme live when the user toggles.
 *
 *  Honours prefers-reduced-motion (renders one static frame, no RAF loop,
 *  no mouse / scroll listeners registered).
 *
 *  The canvas is decorative (aria-hidden, pointer-events: none) and sits
 *  between the hero-section .bg-grid layer and the z-10 content.
 * -------------------------------------------------------------------------- */

type Rgb = readonly [number, number, number];

type Vec3 = { x: number; y: number; z: number };

type NodeDef = {
  p: Vec3; // world-space position, roughly in [-0.5, 0.5] per axis
  r: number; // hex radius at a 900-px reference viewport, pre-projection
};

type ThreadDef = {
  // Source of the connection. Either a literal world-space anchor (for
  // threads that arrive from "off-frame" sources such as humans, other
  // orgs, etc.) or another node in NODES — which gives us agent-to-agent
  // links that double as bidirectional conversations.
  from: Vec3 | { node: number };
  to: number; // index into NODES
  state: "accepted" | "scoped" | "refused";
  phase: number; // 0..1, particle starting offset
  speed: number; // loops per second
  particles: number; // forward traffic (from -> to)
  back?: number; // reverse traffic (to -> from); default 0
  cp: Vec3; // world-space bezier control-point offset vs. the midpoint
};

/* -------------------------------------------------------------------------- */
/*  Palette (Verana Foundation brand — purple primary, green secondary)       */
/* -------------------------------------------------------------------------- */

const STATE: Record<ThreadDef["state"], Rgb> = {
  accepted: [31, 181, 122], // green  #1fb57a — growth & community
  scoped: [118, 62, 240], // purple #763ef0 — primary
  refused: [225, 90, 90], // soft red — kept for "refused" semantics
};

const NODE_STROKE: Rgb[] = [
  [118, 62, 240], // purple  #763ef0
  [88, 101, 242], // blurple bridge tone
  [31, 181, 122], // green   #1fb57a
];

const HALO_NEAR: Rgb = [118, 62, 240]; // purple
const HALO_FAR: Rgb = [31, 181, 122]; // green — the Foundation purple→green signature
const CHECK: Rgb = [63, 210, 154]; // light green check-mark

/**
 * Global speed dial for the whole hero animation. Applied to every
 * time-driven thing uniformly: orbital drift, per-node pulse, particle
 * travel along threads.
 *
 *   1.0   natural speed (original)
 *   0.7   ~30% slower — calm but clearly alive
 *   0.5   slow and meditative
 *   0.3   almost frozen, occasional motion  ← current default
 *
 * To retune the vibe, change this one number. No other edits needed.
 */
const ANIMATION_SPEED = 0.3;

const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* -------------------------------------------------------------------------- */
/*  Scene — hand-placed so the constellation reads nicely at any aspect       */
/* -------------------------------------------------------------------------- */

const NODES: NodeDef[] = [
  { p: { x: -0.40, y:  0.02, z: -0.18 }, r: 17 },
  { p: { x: -0.26, y:  0.22, z:  0.24 }, r: 13 },
  { p: { x: -0.10, y: -0.22, z: -0.04 }, r: 15 },
  { p: { x:  0.02, y:  0.06, z:  0.34 }, r: 12 },
  { p: { x:  0.08, y:  0.20, z: -0.26 }, r: 13 },
  { p: { x:  0.18, y: -0.14, z:  0.10 }, r: 19 }, // visual hero
  { p: { x:  0.30, y:  0.12, z: -0.06 }, r: 13 },
  { p: { x:  0.40, y: -0.20, z:  0.22 }, r: 11 },
  { p: { x:  0.44, y:  0.08, z:  0.00 }, r: 14 },
  { p: { x: -0.05, y: -0.02, z: -0.38 }, r: 10 },
];

const THREADS: ThreadDef[] = [
  // node 0 — left-front agent
  { from: { x: -0.75, y:  0.18, z:  0.05 }, to: 0, state: "accepted", phase: 0.00, speed: 0.28, particles: 2, cp: { x: -0.05, y:  0.08, z:  0.00 } },
  { from: { x: -0.72, y: -0.18, z: -0.10 }, to: 0, state: "accepted", phase: 0.40, speed: 0.24, particles: 2, cp: { x:  0.00, y: -0.08, z:  0.05 } },
  { from: { x: -0.30, y: -0.65, z:  0.20 }, to: 0, state: "scoped",   phase: 0.20, speed: 0.22, particles: 1, cp: { x:  0.05, y:  0.00, z:  0.00 } },

  // node 1 — left-back agent
  { from: { x: -0.80, y:  0.55, z:  0.10 }, to: 1, state: "accepted", phase: 0.15, speed: 0.26, particles: 2, cp: { x:  0.05, y:  0.05, z:  0.00 } },
  { from: { x: -0.10, y:  0.55, z:  0.40 }, to: 1, state: "accepted", phase: 0.70, speed: 0.22, particles: 2, cp: { x:  0.00, y:  0.05, z:  0.05 } },

  // node 2 — lower-mid-front agent
  { from: { x: -0.45, y: -0.55, z: -0.20 }, to: 2, state: "accepted", phase: 0.05, speed: 0.30, particles: 2, cp: { x:  0.05, y: -0.05, z:  0.00 } },
  { from: { x:  0.20, y: -0.60, z: -0.05 }, to: 2, state: "accepted", phase: 0.50, speed: 0.26, particles: 2, cp: { x:  0.00, y: -0.05, z:  0.05 } },
  { from: { x: -0.05, y: -0.55, z:  0.30 }, to: 2, state: "refused",  phase: 0.35, speed: 0.20, particles: 0, cp: { x:  0.00, y: -0.10, z:  0.00 } },

  // node 3 — back-center agent (deep)
  { from: { x: -0.20, y:  0.55, z:  0.50 }, to: 3, state: "accepted", phase: 0.20, speed: 0.24, particles: 2, cp: { x:  0.00, y:  0.05, z:  0.00 } },
  { from: { x:  0.35, y:  0.50, z:  0.55 }, to: 3, state: "accepted", phase: 0.65, speed: 0.22, particles: 2, cp: { x:  0.00, y:  0.05, z:  0.05 } },

  // node 4 — upper-mid-front agent
  { from: { x:  0.10, y:  0.60, z: -0.40 }, to: 4, state: "accepted", phase: 0.10, speed: 0.28, particles: 2, cp: { x:  0.00, y:  0.05, z:  0.00 } },
  { from: { x: -0.10, y:  0.60, z: -0.05 }, to: 4, state: "scoped",   phase: 0.55, speed: 0.20, particles: 1, cp: { x: -0.05, y:  0.05, z: -0.05 } },

  // node 5 — the hero node, busiest
  { from: { x: -0.30, y:  0.50, z:  0.05 }, to: 5, state: "accepted", phase: 0.00, speed: 0.32, particles: 3, cp: { x:  0.00, y:  0.08, z:  0.00 } },
  { from: { x:  0.50, y:  0.55, z:  0.00 }, to: 5, state: "accepted", phase: 0.22, speed: 0.28, particles: 2, cp: { x:  0.05, y:  0.06, z:  0.00 } },
  { from: { x:  0.60, y: -0.55, z: -0.05 }, to: 5, state: "accepted", phase: 0.55, speed: 0.26, particles: 2, cp: { x:  0.05, y: -0.05, z:  0.05 } },
  { from: { x: -0.05, y: -0.55, z:  0.40 }, to: 5, state: "scoped",   phase: 0.35, speed: 0.22, particles: 1, cp: { x:  0.00, y: -0.05, z:  0.05 } },
  { from: { x:  0.15, y: -0.55, z: -0.45 }, to: 5, state: "refused",  phase: 0.70, speed: 0.22, particles: 0, cp: { x:  0.00, y: -0.08, z:  0.00 } },

  // node 6 — right-mid agent
  { from: { x:  0.75, y:  0.40, z:  0.00 }, to: 6, state: "accepted", phase: 0.05, speed: 0.28, particles: 2, cp: { x:  0.05, y:  0.05, z:  0.00 } },
  { from: { x:  0.15, y:  0.55, z:  0.20 }, to: 6, state: "accepted", phase: 0.60, speed: 0.24, particles: 2, cp: { x:  0.00, y:  0.05, z:  0.05 } },

  // node 7 — right-back agent
  { from: { x:  0.85, y: -0.50, z:  0.35 }, to: 7, state: "accepted", phase: 0.25, speed: 0.26, particles: 2, cp: { x:  0.05, y: -0.05, z:  0.05 } },
  { from: { x:  0.20, y: -0.55, z:  0.45 }, to: 7, state: "scoped",   phase: 0.75, speed: 0.20, particles: 1, cp: { x:  0.00, y: -0.05, z:  0.05 } },

  // node 8 — right-edge agent
  { from: { x:  0.85, y:  0.40, z: -0.05 }, to: 8, state: "accepted", phase: 0.15, speed: 0.26, particles: 2, cp: { x:  0.05, y:  0.05, z:  0.00 } },
  { from: { x:  0.85, y: -0.35, z: -0.10 }, to: 8, state: "accepted", phase: 0.55, speed: 0.28, particles: 2, cp: { x:  0.05, y: -0.05, z:  0.00 } },
  { from: { x:  0.85, y:  0.05, z:  0.40 }, to: 8, state: "refused",  phase: 0.80, speed: 0.22, particles: 0, cp: { x:  0.05, y:  0.00, z:  0.05 } },

  // node 9 — deep-front agent (behind camera direction — mostly visible as it rotates)
  { from: { x: -0.30, y: -0.20, z: -0.75 }, to: 9, state: "accepted", phase: 0.10, speed: 0.26, particles: 2, cp: { x: -0.05, y: -0.05, z: -0.05 } },
  { from: { x:  0.20, y:  0.20, z: -0.75 }, to: 9, state: "scoped",   phase: 0.60, speed: 0.22, particles: 1, cp: { x:  0.05, y:  0.05, z: -0.05 } },

  /* ---- agent ↔ agent conversations --------------------------------------
   * Node-to-node threads with non-zero `back` render traffic in both
   * directions, telling the "agents talking to other agents" half of the
   * hero narrative. Kept deliberately few (~4) so the scene still reads
   * as mostly inbound requests rather than a fully-meshed blob.
   * ---------------------------------------------------------------------- */

  // hero node (5) <-> back-center (3) — the busy cross-depth link
  { from: { node: 3 }, to: 5, state: "accepted", phase: 0.00, speed: 0.24, particles: 2, back: 2, cp: { x: 0.00, y:  0.06, z: -0.02 } },

  // hero node (5) <-> right-mid agent (6) — tight collaboration
  { from: { node: 6 }, to: 5, state: "accepted", phase: 0.30, speed: 0.30, particles: 2, back: 2, cp: { x: 0.00, y: -0.05, z:  0.00 } },

  // left-front (0) <-> lower-front (2) — side channel
  { from: { node: 0 }, to: 2, state: "accepted", phase: 0.50, speed: 0.22, particles: 1, back: 1, cp: { x: -0.05, y: -0.10, z: -0.05 } },

  // upper-mid (4) <-> right-edge (8) — cross-network gossip, scoped
  { from: { node: 4 }, to: 8, state: "scoped",   phase: 0.15, speed: 0.20, particles: 1, back: 1, cp: { x:  0.05, y:  0.10, z:  0.00 } },

  /* ---- off-frame request/response (human ↔ service) --------------------
   * A couple of the off-frame threads also flow both ways, e.g. a user
   * phone sending a request and the agent answering back.
   * ---------------------------------------------------------------------- */

  { from: { x: -0.60, y:  0.35, z:  0.00 }, to: 5, state: "accepted", phase: 0.40, speed: 0.28, particles: 2, back: 2, cp: { x:  0.00, y:  0.08, z:  0.00 } },
  { from: { x:  0.70, y:  0.30, z:  0.15 }, to: 8, state: "accepted", phase: 0.75, speed: 0.26, particles: 1, back: 1, cp: { x:  0.05, y:  0.08, z:  0.00 } },
];

/** Unwraps a ThreadDef `from` to a concrete Vec3 whether it's an off-frame
 *  anchor or a reference to another node. */
const resolveFrom = (from: Vec3 | { node: number }): Vec3 =>
  "node" in from ? NODES[from.node].p : from;

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function HeroGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- theme awareness ----------------------------------------
     * The Foundation site flips theme via `data-theme` on <html>. We read
     * it live so colours/compositing track the active theme, not the OS.
     * On dark we use additive ("lighter") blending for a neon glow; on
     * light that would wash to white, so we use "source-over" + a small
     * alpha boost so the strokes still read on the pale surface.
     * ------------------------------------------------------------------ */
    let isDark =
      document.documentElement.getAttribute("data-theme") === "dark";

    const themeObserver = new MutationObserver(() => {
      isDark =
        document.documentElement.getAttribute("data-theme") === "dark";
      if (reduceMotion) render(performance.now());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    /* ---------- mutable state ------------------------------------------- */

    let width = 0;
    let height = 0;
    let rafId = 0;
    const start = performance.now();

    // Target mouse in [-0.5, 0.5] (both axes), lerped toward by current.
    let targetMx = 0;
    let targetMy = 0;
    let mx = 0;
    let my = 0;

    // Scroll normalised to [0, 1] while the hero is in view.
    let targetScroll = 0;
    let scroll = 0;

    /* ---------- sizing -------------------------------------------------- */

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      // Clamp DPR; beyond 2 the pixel cost outweighs any visible sharpness
      // gain for an ambient background layer.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Reference viewport so radii, line widths and world scale stay stable
    // across phones and desktops.
    const scaleRef = () => Math.max(0.55, Math.min(width, height) / 900);

    // How many screen pixels one world-unit of XY covers at z=0.
    const worldScale = () => Math.min(width, height) * 1.25;

    /* ---------- math helpers ------------------------------------------- */

    const bezier3 = (a: Vec3, c: Vec3, b: Vec3, t: number): Vec3 => {
      const u = 1 - t;
      return {
        x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
        z: u * u * a.z + 2 * u * t * c.z + t * t * b.z,
      };
    };

    // Rotate a 3D point around Y (yaw), then X (pitch).
    const rotate = (v: Vec3, yaw: number, pitch: number): Vec3 => {
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const x1 = v.x * cy + v.z * sy;
      const z1 = -v.x * sy + v.z * cy;
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const y1 = v.y * cp - z1 * sp;
      const z2 = v.y * sp + z1 * cp;
      return { x: x1, y: y1, z: z2 };
    };

    // Perspective projection. Returns screen-space x/y plus a `scale` factor
    // that callers fold into radii, line widths and alpha (fog).
    const FOCAL = 1.1;
    const project = (v: Vec3) => {
      const k = FOCAL / (FOCAL + v.z);
      const ws = worldScale();
      return {
        x: width / 2 + v.x * ws * k,
        y: height / 2 + v.y * ws * k,
        k, // > 1 when the point is in front of origin, < 1 behind
        z: v.z, // keep depth for fog / sort
      };
    };

    // Depth-dependent alpha. At z = -0.4 (closest), ~1.0; at z = +0.5
    // (farthest), ~0.35. The sceneZ argument is the point's z _after_
    // rotation, so nodes actually fade in/out as the scene rotates.
    const fog = (z: number) => {
      const t = (0.5 - z) / 0.9; // 0..1 maps +0.5 -> 0, -0.4 -> 1
      return Math.max(0.35, Math.min(1, t));
    };

    /* ---------- draw ---------------------------------------------------- */

    const render = (nowMs: number) => {
      // Scaling timeSec once here means every downstream animation term
      // (`timeSec * 0.18` for orbital yaw, `timeSec * th.speed` for
      // particles, `timeSec * 1.1` for node pulse, etc.) inherits the
      // ANIMATION_SPEED factor automatically.
      const timeSec = ((nowMs - start) / 1000) * ANIMATION_SPEED;

      // Smooth trailing state so motion never jitters even when the mouse
      // moves discretely or the scroll event fires rapidly.
      mx += (targetMx - mx) * 0.07;
      my += (targetMy - my) * 0.07;
      scroll += (targetScroll - scroll) * 0.08;

      // Base orbital drift (very slow) + mouse parallax + scroll tilt.
      const yaw = Math.sin(timeSec * 0.18) * 0.08 + mx * 0.55;
      const pitch =
        Math.sin(timeSec * 0.14 + 1.2) * 0.05 + my * 0.32 + scroll * 0.18;

      ctx.clearRect(0, 0, width, height);

      // Project every node once per frame; reused for threads.
      const projectedNodes = NODES.map((n) => {
        const r = rotate(n.p, yaw, pitch);
        return { n, r, s: project(r) };
      });

      // Collect drawables (threads + nodes) so we can paint back-to-front
      // per element. For threads we sort by midpoint depth.
      type Drawable =
        | { kind: "thread"; th: ThreadDef; depth: number }
        | { kind: "node"; idx: number; depth: number };

      const drawables: Drawable[] = [];

      for (let i = 0; i < projectedNodes.length; i++) {
        drawables.push({ kind: "node", idx: i, depth: projectedNodes[i].r.z });
      }

      for (const th of THREADS) {
        const fromWorld = resolveFrom(th.from);
        const aRot = rotate(fromWorld, yaw, pitch);
        const b = projectedNodes[th.to].r;
        const midWorld = {
          x: (fromWorld.x + NODES[th.to].p.x) / 2 + th.cp.x,
          y: (fromWorld.y + NODES[th.to].p.y) / 2 + th.cp.y,
          z: (fromWorld.z + NODES[th.to].p.z) / 2 + th.cp.z,
        };
        const cRot = rotate(midWorld, yaw, pitch);
        drawables.push({
          kind: "thread",
          th,
          depth: (aRot.z + b.z + cRot.z) / 3,
        });
      }

      // Painter's algorithm — deepest first.
      drawables.sort((a, b) => b.depth - a.depth);

      // Additive glow on dark; plain alpha on light (additive clamps to
      // white over a pale surface and disappears).
      ctx.globalCompositeOperation = isDark ? "lighter" : "source-over";
      for (const d of drawables) {
        if (d.kind === "thread") {
          drawThread(d.th, timeSec, yaw, pitch);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      for (const d of drawables) {
        if (d.kind === "node") {
          drawNode(d.idx, timeSec, projectedNodes[d.idx]);
        }
      }

      if (!reduceMotion) rafId = requestAnimationFrame(render);
    };

    const drawThread = (
      th: ThreadDef,
      timeSec: number,
      yaw: number,
      pitch: number,
    ) => {
      const aWorld = resolveFrom(th.from);
      const bWorld = NODES[th.to].p;
      const cWorld: Vec3 = {
        x: (aWorld.x + bWorld.x) / 2 + th.cp.x,
        y: (aWorld.y + bWorld.y) / 2 + th.cp.y,
        z: (aWorld.z + bWorld.z) / 2 + th.cp.z,
      };

      const aRot = rotate(aWorld, yaw, pitch);
      const bRot = rotate(bWorld, yaw, pitch);
      const cRot = rotate(cWorld, yaw, pitch);

      const a = project(aRot);
      const b = project(bRot);
      const c = project(cRot);

      const endT = th.state === "refused" ? 0.55 : 1;
      const endWorld = bezier3(aWorld, cWorld, bWorld, endT);
      const endProj = project(rotate(endWorld, yaw, pitch));

      const colour = STATE[th.state];
      // Light mode needs a little more punch since we're not adding light.
      const boost = isDark ? 1 : 1.3;
      const alpha =
        (th.state === "scoped" ? 0.4 : 0.55) *
        boost *
        ((fog(aRot.z) + fog(bRot.z)) / 2);

      // Bidirectional (back > 0) or node-originated threads get a symmetric
      // gradient so neither endpoint is visually demoted to "source". Pure
      // inbound-from-off-frame threads keep the fade-in-from-anchor ramp
      // that reads naturally as "a request arriving at the agent".
      const back = th.back ?? 0;
      const symmetric = back > 0 || "node" in th.from;

      const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      if (symmetric) {
        grad.addColorStop(0, rgba(colour, alpha * 0.55));
        grad.addColorStop(0.5, rgba(colour, alpha));
        grad.addColorStop(1, rgba(colour, alpha * 0.55));
      } else {
        grad.addColorStop(0, rgba(colour, 0));
        grad.addColorStop(1, rgba(colour, alpha));
      }

      ctx.strokeStyle = grad;
      ctx.lineWidth = (symmetric ? 1.15 : 1) * scaleRef();
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);

      if (th.state === "refused") {
        const mid = project(rotate(bezier3(aWorld, cWorld, bWorld, 0.35), yaw, pitch));
        ctx.quadraticCurveTo(mid.x, mid.y, endProj.x, endProj.y);
      } else {
        ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      }
      ctx.stroke();

      if (th.particles === 0 && back === 0) return;

      /* ---- particle pass -------------------------------------------------
       * `u` is the particle's position along the forward curve [0..1].
       * `progress` is how far the particle is through its *own* journey.
       * For forward traffic they're the same; for reverse traffic we
       * invert u so particles travel to->from but still brighten as they
       * approach their destination (the `from` side).
       * ------------------------------------------------------------------ */
      const drawParticle = (u: number, progress: number) => {
        const pWorld = bezier3(aWorld, cWorld, bWorld, u);
        const pRot = rotate(pWorld, yaw, pitch);
        const pProj = project(pRot);

        const f = fog(pRot.z);
        const brighten = 0.35 + 0.65 * progress;
        const a0 = brighten * f;
        const radius =
          (1.6 + 1.2 * progress) * scaleRef() * Math.max(0.6, pProj.k);

        const glow = ctx.createRadialGradient(
          pProj.x,
          pProj.y,
          0,
          pProj.x,
          pProj.y,
          radius * 5,
        );
        glow.addColorStop(0, rgba(colour, a0 * (isDark ? 0.55 : 0.4)));
        glow.addColorStop(1, rgba(colour, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pProj.x, pProj.y, radius * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba(colour, Math.min(1, a0 + 0.3));
        ctx.beginPath();
        ctx.arc(pProj.x, pProj.y, radius * 0.85, 0, Math.PI * 2);
        ctx.fill();
      };

      // Forward stream: from -> to.
      for (let i = 0; i < th.particles; i++) {
        const u = (timeSec * th.speed + th.phase + i / th.particles) % 1;
        drawParticle(u, u);
      }

      // Reverse stream: to -> from. Offset by 0.5 so reverse beads don't
      // sit on top of forward ones at every frame.
      for (let i = 0; i < back; i++) {
        const uR = (timeSec * th.speed + th.phase + 0.5 + i / back) % 1;
        drawParticle(1 - uR, uR);
      }
    };

    const drawNode = (
      idx: number,
      timeSec: number,
      pn: { n: NodeDef; r: Vec3; s: ReturnType<typeof project> },
    ) => {
      const { n, r: rot, s } = pn;
      const k = Math.max(0.55, s.k);
      const r = n.r * scaleRef() * k;
      const f = fog(rot.z);

      // Each node breathes on its own phase so the constellation never
      // flashes in unison.
      const pulse = 0.82 + 0.18 * Math.sin(timeSec * 1.1 + idx * 0.9);

      // Halo — a near/far colour mix gives depth cues even on nodes that
      // happen to rotate through the center. Brighter on dark so the glow
      // reads; softer on light so it doesn't muddy the pale surface.
      const haloColour: Rgb = rot.z < 0 ? HALO_NEAR : HALO_FAR;
      const haloA = isDark ? 0.32 : 0.22;
      const halo = ctx.createRadialGradient(
        s.x,
        s.y,
        r * 0.3,
        s.x,
        s.y,
        r * 3.2,
      );
      halo.addColorStop(0, rgba(haloColour, haloA * pulse * f));
      halo.addColorStop(0.55, rgba(haloColour, haloA * 0.25 * pulse * f));
      halo.addColorStop(1, rgba(haloColour, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Hex body.
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.fillStyle = rgba(HALO_NEAR, (isDark ? 0.05 : 0.07) * f);
      ctx.fill();

      const stroke = ctx.createLinearGradient(-r, -r, r, r);
      stroke.addColorStop(0, rgba(NODE_STROKE[0], 0.9 * f));
      stroke.addColorStop(0.5, rgba(NODE_STROKE[1], 0.9 * f));
      stroke.addColorStop(1, rgba(NODE_STROKE[2], 0.9 * f));
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5 * scaleRef() * k;
      ctx.stroke();

      // Tiny verified check-mark, only on nodes close enough that it'd read.
      if (k > 0.75) {
        const cr = r * 0.38;
        ctx.beginPath();
        ctx.moveTo(-cr * 0.65, 0);
        ctx.lineTo(-cr * 0.15, cr * 0.5);
        ctx.lineTo(cr * 0.65, -cr * 0.55);
        ctx.strokeStyle = rgba(CHECK, 0.95 * f);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 1.6 * scaleRef() * k;
        ctx.stroke();
      }

      ctx.restore();
    };

    /* ---------- interaction --------------------------------------------- */

    const onPointerMove = (e: PointerEvent) => {
      // Use the viewport so the parallax tracks the cursor naturally even
      // when the user is well below the hero section (the canvas itself
      // may not be on screen any more, but recalculating against the
      // viewport gives a continuous value with no jumps).
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      targetMx = (e.clientX - cx) / window.innerWidth;
      targetMy = (e.clientY - cy) / window.innerHeight;
    };

    const onScroll = () => {
      const rect = wrapper.getBoundingClientRect();
      const h = rect.height || 1;
      // 0 while the hero top is at the viewport top; 1 when the hero is
      // fully scrolled out. Clamp so we stop integrating past the hero.
      const progress = Math.max(0, Math.min(1, -rect.top / h));
      targetScroll = progress;
    };

    /* ---------- wiring -------------------------------------------------- */

    resize();
    onScroll();
    render(performance.now());

    const onResize = () => {
      resize();
      if (reduceMotion) render(performance.now());
    };

    window.addEventListener("resize", onResize);

    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    return () => {
      cancelAnimationFrame(rafId);
      themeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="hero-canvas absolute inset-0 pointer-events-none"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
