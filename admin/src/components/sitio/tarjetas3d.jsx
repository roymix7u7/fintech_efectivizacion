"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

/**
 * Tarjetas en 3D de la portada.
 *
 * Son decorativas: flotan a los lados del titular, entran deslizándose
 * desde los bordes y se inclinan siguiendo el puntero. Cada una tiene su
 * profundidad (--prof): las cercanas se mueven más que las lejanas, y eso
 * da la sensación de volumen. Con movimiento reducido quedan quietas en
 * su sitio, ya visibles.
 */
const VERDE = { src: "/sitio/tarjeta-verde.webp", ancho: 900, alto: 589 };
const NARANJA = { src: "/sitio/tarjeta-naranja.webp", ancho: 900, alto: 588 };
const MORADA = { src: "/sitio/tarjeta-morada.webp", ancho: 900, alto: 589 };
const ROJA = { src: "/sitio/tarjeta-roja.webp", ancho: 900, alto: 654 };

// A los lados del titular (pantallas anchas). Las posiciones salen del
// centro para que nunca pisen el texto, sea cual sea el ancho.
const LADOS = [
  {
    img: NARANJA,
    lejana: true,
    estilo: {
      "--w": "clamp(130px, 10vw, 190px)",
      left: "calc(50% - 470px - var(--w))",
      top: "16%",
      "--rx": "14deg",
      "--ry": "28deg",
      "--rz": "14deg",
      "--prof": 10,
      "--desde": "-30vw",
      "--desde-giro": "40deg",
      "--retraso": "450ms",
      "--ritmo": "8s",
      "--fase": "-2s",
    },
  },
  {
    img: VERDE,
    estilo: {
      "--w": "clamp(230px, 19vw, 340px)",
      left: "calc(50% - 370px - var(--w))",
      top: "54%",
      "--rx": "18deg",
      "--ry": "24deg",
      "--rz": "-12deg",
      "--prof": 28,
      "--desde": "-40vw",
      "--desde-giro": "55deg",
      "--retraso": "150ms",
      "--ritmo": "7s",
      "--fase": "0s",
    },
  },
  {
    img: MORADA,
    estilo: {
      "--w": "clamp(230px, 19vw, 340px)",
      right: "calc(50% - 340px - var(--w))",
      top: "21%",
      "--rx": "16deg",
      "--ry": "-26deg",
      "--rz": "11deg",
      "--prof": 32,
      "--desde": "40vw",
      "--desde-giro": "-55deg",
      "--retraso": "300ms",
      "--ritmo": "7.5s",
      "--fase": "-3.5s",
    },
  },
  {
    img: ROJA,
    estilo: {
      "--w": "clamp(150px, 12vw, 230px)",
      right: "calc(50% - 450px - var(--w))",
      top: "64%",
      "--rx": "12deg",
      "--ry": "-30deg",
      "--rz": "-10deg",
      "--prof": 18,
      "--desde": "35vw",
      "--desde-giro": "-45deg",
      "--retraso": "600ms",
      "--ritmo": "8.5s",
      "--fase": "-5s",
    },
  },
];

// En abanico debajo de los botones (celular, tablet y laptops chicas).
const ABANICO = [
  { img: VERDE, x: "0%", y: "22%", rz: "-16deg", ry: "18deg", z: 0, retraso: 200, fase: -1, desde: "-60vw" },
  { img: NARANJA, x: "18%", y: "4%", rz: "-6deg", ry: "6deg", z: 1, retraso: 320, fase: -2.5, desde: "-20vw" },
  { img: ROJA, x: "37%", y: "6%", rz: "6deg", ry: "-6deg", z: 2, retraso: 440, fase: -4, desde: "20vw" },
  { img: MORADA, x: "56%", y: "22%", rz: "15deg", ry: "-18deg", z: 1, retraso: 560, fase: -3, desde: "60vw" },
].map((t, i) => ({
  img: t.img,
  estilo: {
    "--w": "44%",
    left: t.x,
    top: t.y,
    zIndex: t.z,
    "--rx": "12deg",
    "--ry": t.ry,
    "--rz": t.rz,
    "--prof": 12 + i * 2,
    "--desde": t.desde,
    "--desde-giro": "0deg",
    "--retraso": `${t.retraso}ms`,
    "--ritmo": `${6.5 + i * 0.5}s`,
    "--fase": `${t.fase}s`,
  },
}));

function Tarjeta({ img, estilo, lejana, prioridad, entrada = true }) {
  return (
    <div
      className={`absolute ${entrada ? "tarjeta-3d" : ""} ${lejana ? "tarjeta-3d--lejana" : ""}`}
      style={{ width: "var(--w)", ...estilo }}
    >
      <div className="tarjeta-3d__flota">
        <div className="tarjeta-3d__giro">
          <Image
            src={img.src}
            alt=""
            width={img.ancho}
            height={img.alto}
            unoptimized
            priority={prioridad}
            draggable={false}
            className="h-auto w-full select-none"
          />
          <span
            className="tarjeta-3d__brillo"
            style={{ "--mascara": `url(${img.src})` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Mueve las tarjetas con el puntero y con el scroll de la sección. En la
 * portada el scroll cuenta desde arriba; en las demás secciones, desde que
 * la sección está centrada en la pantalla, y con menos recorrido.
 */
function useParallax(ref, portada = true, conScroll = true) {
  useEffect(() => {
    const seccion = ref.current?.closest("section");
    if (!seccion) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let marco = 0;
    let nx = 0;
    let ny = 0;
    const pintar = () => {
      marco = 0;
      seccion.style.setProperty("--nx", nx.toFixed(3));
      seccion.style.setProperty("--ny", ny.toFixed(3));
      let sy = 0;
      if (!conScroll) {
        // Panel fijo (sticky): moverlo con el scroll lo descuadra.
      } else if (portada) {
        sy = Math.min(window.scrollY, seccion.offsetHeight);
      } else {
        const r = seccion.getBoundingClientRect();
        const centro = r.top + r.height / 2 - window.innerHeight / 2;
        sy = Math.max(-300, Math.min(300, -centro * 0.3));
      }
      seccion.style.setProperty("--sy", sy.toFixed(0));
    };
    const pedir = () => {
      if (!marco) marco = requestAnimationFrame(pintar);
    };
    const mover = (e) => {
      const r = seccion.getBoundingClientRect();
      nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      pedir();
    };
    const salir = () => {
      nx = 0;
      ny = 0;
      pedir();
    };

    const fino = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (fino) {
      seccion.addEventListener("pointermove", mover);
      seccion.addEventListener("pointerleave", salir);
    }
    window.addEventListener("scroll", pedir, { passive: true });
    pedir();
    return () => {
      cancelAnimationFrame(marco);
      seccion.removeEventListener("pointermove", mover);
      seccion.removeEventListener("pointerleave", salir);
      window.removeEventListener("scroll", pedir);
    };
  }, [ref, portada, conScroll]);
}

/** Tarjetas a los lados del titular, solo en pantallas anchas. */
export function TarjetasLados() {
  const ref = useRef(null);
  useParallax(ref);
  return (
    <div
      ref={ref}
      aria-hidden
      className="escena-3d pointer-events-none absolute inset-0 hidden xl:block"
    >
      {LADOS.map((t) => (
        <Tarjeta key={t.img.src} {...t} prioridad />
      ))}
    </div>
  );
}

/** Las mismas tarjetas en abanico, para pantallas angostas. */
export function TarjetasAbanico() {
  return (
    <div
      aria-hidden
      className="escena-3d relative mx-auto mt-14 aspect-[2.3/1] w-full max-w-[460px] sm:max-w-[560px] xl:hidden"
    >
      {ABANICO.map((t) => (
        <Tarjeta key={t.img.src} {...t} />
      ))}
    </div>
  );
}

/**
 * Objetos 3D sueltos (escudo, monedas...) con el mismo trato que las
 * tarjetas: flotan, brillan y siguen al puntero. Entran con la sección
 * (data-revelar), no al cargar la página. Cada objeto lleva su posición
 * y profundidad en `estilo`, igual que LADOS.
 */
export function Objetos3D({
  objetos,
  chispas = [],
  className = "relative",
  conScroll = true,
}) {
  const ref = useRef(null);
  useParallax(ref, false, conScroll);
  return (
    <div
      ref={ref}
      aria-hidden
      className={`escena-3d pointer-events-none ${className}`}
    >
      {chispas.map((c, i) => (
        <Chispa key={i} {...c} />
      ))}
      {objetos.map((o) => (
        <Tarjeta key={o.img.src} {...o} entrada={false} />
      ))}
    </div>
  );
}

/** Destello de cuatro puntas que titila. */
function Chispa({ x, y, t = 18, color = "#E8B800", retraso = 0 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="chispa absolute"
      style={{
        left: x,
        top: y,
        width: t,
        height: t,
        color,
        animationDelay: `${retraso}s`,
      }}
    >
      <path
        fill="currentColor"
        d="M12 0c.8 6.4 2.6 9.9 12 12-9.4 2.1-11.2 5.6-12 12-.8-6.4-2.6-9.9-12-12C9.4 9.9 11.2 6.4 12 0Z"
      />
    </svg>
  );
}

/**
 * Inclina lo que envuelve hacia el puntero, como si fuera una lámina
 * apoyada sobre la mesa. Sin puntero fino o con movimiento reducido no
 * hace nada.
 */
export function Inclinable({ children, className = "", max = 6 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let marco = 0;
    const mover = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(marco);
      marco = requestAnimationFrame(() => {
        el.style.setProperty("--ix", `${(x * max * 2).toFixed(2)}deg`);
        el.style.setProperty("--iy", `${(-y * max * 2).toFixed(2)}deg`);
      });
    };
    const salir = () => {
      cancelAnimationFrame(marco);
      el.style.setProperty("--ix", "0deg");
      el.style.setProperty("--iy", "0deg");
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerleave", salir);
    return () => {
      cancelAnimationFrame(marco);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerleave", salir);
    };
  }, [max]);
  return (
    <div ref={ref} className={`inclinable ${className}`}>
      {children}
    </div>
  );
}
