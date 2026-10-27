"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animaciones de entrada de la landing.
 *
 * Todo lo marcado con data-revelar se ve normal si no hay JavaScript o si
 * la persona pidió menos movimiento. Solo cuando esto corre, lo que aún
 * está fuera de la vista se oculta un momento y aparece al llegar a él:
 * así ninguna sección queda en blanco esperando.
 */
export function Animaciones() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const elementos = [...document.querySelectorAll("[data-revelar]")];
    const alto = window.innerHeight;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("revelado");
          obs.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    for (const el of elementos) {
      // Lo que ya se ve al cargar no se toca.
      if (el.getBoundingClientRect().top < alto * 0.92) continue;
      el.classList.add("por-revelar");
      obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);
  return null;
}

/** Número que sube hasta su valor cuando entra en pantalla. */
export function Contador({ hasta, prefijo = "", sufijo = "", duracion = 1600 }) {
  const ref = useRef(null);
  const [valor, setValor] = useState(hasta);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let marco;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        const inicio = performance.now();
        const paso = (t) => {
          const p = Math.min(1, (t - inicio) / duracion);
          const suave = 1 - Math.pow(1 - p, 3);
          setValor(Math.round(hasta * suave));
          if (p < 1) marco = requestAnimationFrame(paso);
        };
        setValor(0);
        marco = requestAnimationFrame(paso);
      },
      { threshold: 0.6 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(marco);
    };
  }, [hasta, duracion]);

  return (
    <span ref={ref} className="cifras">
      {prefijo}
      {valor.toLocaleString("es-PE")}
      {sufijo}
    </span>
  );
}
