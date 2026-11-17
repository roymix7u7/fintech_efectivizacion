"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { nombreBanco } from "@/lib/bancos";
import { cn } from "@/lib/utils";
import { Aviso } from "@/components/marca";
import { Panel } from "@/components/piezas";
import { EsqueletoTarjetas } from "@/components/carga";
import { Tendencia, BarrasH, Cifra, SERIE } from "@/components/graficos";

/**
 * Gráficos del Resumen (función resumen_graficos de Supabase).
 *
 *   · Administrador: la empresa completa, con comparación entre sedes, o
 *     una sede si la elige.
 *   · Supervisor: su sede (lo decide la base, no esta pantalla).
 *
 * Todo se mide en cantidad de operaciones: las solicitudes no guardan el
 * monto, así que aquí no hay soles.
 */
const PERIODOS = [
  { dias: 7, texto: "7 días" },
  { dias: 30, texto: "30 días" },
  { dias: 90, texto: "90 días" },
];

const diaCorto = (iso) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
};
const diaLargo = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
const hora12 = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "a. m." : "p. m."}`;
const persona = (correo) => (correo || "").split("@")[0];

export default function ResumenGraficos({ esAdmin }) {
  const [dias, setDias] = useState(30);
  const [sede, setSede] = useState("");
  const [sedes, setSedes] = useState([]);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!esAdmin) return;
    supabase
      .from("sedes")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre")
      .then(({ data }) => setSedes(data || []));
  }, [esAdmin]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    supabase.rpc("resumen_graficos", { p_dias: dias, p_sede: sede || null }).then(({ data, error: e }) => {
      if (!vivo) return;
      setCargando(false);
      if (e) {
        setDatos(null);
        return setError(
          e.code === "PGRST202" || /resumen_graficos/.test(e.message || "")
            ? "Falta aplicar en Supabase la migración 20261116000076_resumen_graficos.sql para ver los gráficos."
            : "No se pudieron cargar los gráficos: " + e.message,
        );
      }
      setError("");
      setDatos(data);
    });
    return () => {
      vivo = false;
    };
  }, [dias, sede]);

  const controles = (
    <div className="flex flex-wrap items-center gap-2">
      {esAdmin && sedes.length > 0 && (
        <select
          aria-label="Sede"
          value={sede}
          onChange={(e) => setSede(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-semibold shadow-panel"
        >
          <option value="">Toda la empresa</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      )}
      <div role="radiogroup" aria-label="Periodo" className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-panel">
        {PERIODOS.map((p) => (
          <button
            key={p.dias}
            type="button"
            role="radio"
            aria-checked={dias === p.dias}
            onClick={() => setDias(p.dias)}
            className={cn(
              "h-8 rounded-md px-3 text-sm font-semibold transition",
              dias === p.dias ? "bg-marca-700 text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.texto}
          </button>
        ))}
      </div>
    </div>
  );

  const deSede = datos?.alcance === "sede";
  const titulo = !datos || datos.sin_sede ? "Indicadores" : deSede ? `Indicadores de ${datos.sede?.nombre || "tu sede"}` : "Indicadores de la empresa";

  return (
    <section className="mt-8" aria-label="Indicadores">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="t-seccion">{titulo}</h2>
          <p className="text-sm text-muted-foreground">
            {deSede
              ? "Lo que revisó y registró el personal de la sede, en cantidad de operaciones."
              : "En cantidad de operaciones, comparado con el periodo anterior del mismo largo."}
          </p>
        </div>
        {controles}
      </div>

      {error && <Aviso className="mb-4">{error}</Aviso>}
      {datos?.sin_sede && (
        <Aviso tono="espera" className="mb-4">
          Tu usuario no tiene una sede asignada, así que no hay indicadores que mostrar. Pide al administrador que te asigne una en Equipo.
        </Aviso>
      )}

      {cargando && !datos ? <EsqueletoTarjetas cuantas={4} /> : null}
      {datos && !datos.sin_sede && <Cuerpo d={datos} deSede={deSede} tenue={cargando} />}
    </section>
  );
}

function Cuerpo({ d, deSede, tenue }) {
  const a = d.actual || {};
  const p = d.anterior || {};
  const revisadas = (x) => Number(x.aprobadas || 0) + Number(x.rechazadas || 0);
  const tasa = (x) => (revisadas(x) > 0 ? (Number(x.aprobadas || 0) / revisadas(x)) * 100 : null);

  const serie = (d.serie || []).map((x) => ({ ...x, etiqueta: diaCorto(x.dia) }));
  const largo = (x) => diaLargo(x.dia);

  // Las 24 horas, aunque en alguna no haya llegado nada.
  const porHora = new Map((d.horas || []).map((h) => [h.hora, Number(h.total)]));
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, etiqueta: String(h), total: porHora.get(h) || 0 }));
  const pico = horas.reduce((m, h) => (h.total > m.total ? h : m), horas[0]);

  const partesRevision = [
    { clave: "aprobadas", nombre: "Aprobadas", color: SERIE.azul },
    { clave: "rechazadas", nombre: "Rechazadas", color: SERIE.naranja },
  ];

  return (
    <div className={cn("space-y-5 transition-opacity", tenue && "opacity-60")}>
      {/* ── Cifras del periodo ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {deSede ? (
          <Cifra titulo="Solicitudes revisadas" valor={revisadas(a)} anterior={revisadas(p)} pista="Aprobadas más rechazadas por el personal de la sede." />
        ) : (
          <Cifra titulo="Solicitudes recibidas" valor={a.recibidas} anterior={p.recibidas} pista="Comprobantes que enviaron los clientes." />
        )}
        <Cifra titulo="Aprobación" valor={tasa(a)} anterior={tasa(p)} sufijo="%" pista="De cada 100 solicitudes revisadas, cuántas se aprobaron." />
        <Cifra
          titulo="Tiempo de revisión"
          valor={a.min_revision}
          anterior={p.min_revision}
          sufijo="min"
          decimales={1}
          menosEsMejor
          pista="Promedio desde que llega el comprobante hasta que se aprueba o rechaza."
        />
        <Cifra
          titulo={deSede ? "Clientes registrados en el local" : "Clientes nuevos"}
          valor={a.clientes}
          anterior={p.clientes}
          pista={deSede ? "Altas presenciales hechas por el personal de la sede." : "Cuentas creadas en el periodo."}
        />
      </div>

      {/* ── Evolución ── */}
      <div className="grid gap-5 xl:grid-cols-2">
        {deSede ? (
          <Panel titulo="Revisiones por día" ayuda="Solicitudes que el personal de la sede aprobó o rechazó cada día.">
            <Tendencia tipo="barras" datos={serie} series={partesRevision} etiquetaLarga={largo} />
          </Panel>
        ) : (
          <Panel titulo="Solicitudes por día" ayuda="Las que llegaron y las que se pagaron cada día. Si las pagadas se quedan abajo, se está acumulando trabajo.">
            <Tendencia
              datos={serie}
              series={[
                { clave: "recibidas", nombre: "Recibidas", color: SERIE.azul },
                { clave: "pagadas", nombre: "Pagadas", color: SERIE.naranja },
              ]}
              etiquetaLarga={largo}
            />
          </Panel>
        )}

        <Panel titulo="Tiempo de revisión" ayuda="Minutos promedio que esperó un comprobante hasta ser aprobado o rechazado, por día. Los días sin revisiones quedan en blanco.">
          <Tendencia
            datos={serie}
            series={[{ clave: "min_revision", nombre: "Minutos de espera", color: SERIE.azul }]}
            decimales={1}
            unidad=" min"
            etiquetaLarga={largo}
            vacio="Todavía no hay revisiones en este periodo."
          />
        </Panel>

        {!deSede && (
          <Panel titulo="Aprobadas y rechazadas por día" ayuda="Resultado de las revisiones. Un salto de rechazos suele indicar comprobantes mal enviados o un problema con un banco.">
            <Tendencia tipo="barras" datos={serie} series={partesRevision} etiquetaLarga={largo} />
          </Panel>
        )}

        <Panel
          titulo={deSede ? "Clientes atendidos por día" : "Clientes nuevos por día"}
          ayuda={deSede ? "Clientes que la sede registró en el local e identidades que verificó su personal." : "Cuentas creadas e identidades verificadas cada día."}
        >
          <Tendencia
            datos={serie}
            series={[
              { clave: "clientes", nombre: deSede ? "Registrados en el local" : "Cuentas creadas", color: SERIE.azul },
              { clave: "verificados", nombre: "Identidades verificadas", color: SERIE.naranja },
            ]}
            etiquetaLarga={largo}
          />
        </Panel>

        <Panel
          titulo="Hora en que llegan las solicitudes"
          ayuda="Solicitudes recibidas según la hora del día (hora de Lima), sumando todo el periodo. Sirve para organizar turnos y refrigerios."
          acciones={pico.total > 0 ? <span className="text-chico text-muted-foreground">Hora pico: {hora12(pico.hora)}</span> : null}
        >
          <Tendencia
            tipo="barras"
            datos={horas}
            series={[{ clave: "total", nombre: "Solicitudes", color: SERIE.azul }]}
            etiquetaLarga={(h) => `${hora12(h.hora)} a ${hora12((h.hora + 1) % 24)}`}
          />
        </Panel>

        <Panel titulo="Solicitudes por banco" ayuda="Qué tarjetas se operan más y cómo terminan sus revisiones.">
          <BarrasH
            partes={partesRevision}
            filas={(d.bancos || []).map((b) => ({
              nombre: nombreBanco(b.banco),
              valor: Number(b.aprobadas) + Number(b.rechazadas) || Number(b.total),
              partes: Number(b.aprobadas) + Number(b.rechazadas) > 0 ? { aprobadas: b.aprobadas, rechazadas: b.rechazadas } : { aprobadas: b.total },
              detalle: `${b.total} recibidas · ${b.aprobadas} aprobadas · ${b.rechazadas} rechazadas`,
            }))}
          />
        </Panel>
      </div>

      {/* ── Personas y sedes ── */}
      <div className="grid gap-5 xl:grid-cols-2">
        {!deSede && (d.sedes || []).length > 0 && (
          <Panel titulo="Comparación entre sedes" ayuda="Solicitudes revisadas por el personal de cada sede en el periodo. Pasa el puntero por una fila para ver el detalle.">
            <BarrasH
              partes={partesRevision}
              vacio="Ninguna sede revisó solicitudes en este periodo."
              filas={d.sedes.map((s) => ({
                nombre: s.nombre,
                valor: Number(s.aprobadas) + Number(s.rechazadas),
                partes: { aprobadas: s.aprobadas, rechazadas: s.rechazadas },
                detalle: `${s.personas} personas · ${s.clientes} clientes registrados en el local${s.min_revision != null ? ` · ${s.min_revision} min por revisión` : ""}`,
              }))}
            />
          </Panel>
        )}

        <Panel
          titulo={deSede ? "Trabajo del equipo" : "Trabajo por persona"}
          ayuda="Casos resueltos por cada persona en el periodo: solicitudes, identidades y tarjetas. Pasa el puntero por una fila para ver el detalle."
        >
          <BarrasH
            vacio="Nadie resolvió casos en este periodo."
            partes={[
              { clave: "solicitudes", nombre: "Solicitudes", color: SERIE.azul },
              { clave: "identidades", nombre: "Identidades", color: SERIE.naranja },
              { clave: "tarjetas", nombre: "Tarjetas", color: SERIE.aqua },
            ]}
            filas={(d.personas || []).slice(0, 10).map((x) => {
              const sol = Number(x.aprobadas) + Number(x.rechazadas);
              return {
                nombre: persona(x.email),
                valor: sol + Number(x.identidades) + Number(x.tarjetas),
                partes: { solicitudes: sol, identidades: x.identidades, tarjetas: x.tarjetas },
                detalle: `${sol} solicitudes (${x.rechazadas} rechazadas) · ${x.identidades} identidades · ${x.tarjetas} tarjetas${x.min_revision != null ? ` · ${x.min_revision} min por revisión` : ""}`,
              };
            })}
          />
        </Panel>

        <Panel titulo="Por qué se rechaza" ayuda="Los motivos de rechazo más repetidos en el periodo. Si uno domina, conviene explicarlo mejor al cliente antes de que envíe.">
          <BarrasH
            color={SERIE.naranja}
            vacio="No hubo rechazos en este periodo."
            filas={(d.motivos || []).map((x) => ({ nombre: x.motivo, valor: Number(x.total), detalle: x.motivo }))}
          />
        </Panel>
      </div>
    </div>
  );
}
