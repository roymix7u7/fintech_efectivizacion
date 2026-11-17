"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { Vacio, Aviso } from "@/components/marca";
import { BotonAccion, EsqueletoFilas } from "@/components/carga";
import { Campo, Panel, useConfirmar } from "@/components/piezas";
import Desplegable from "@/components/desplegable";
import { Escudo } from "@/components/shell";

const TIPOS = [
  { valor: "dni", texto: "DNI" },
  { valor: "celular", texto: "Celular" },
  { valor: "cuenta", texto: "Cuenta bancaria" },
];
const TEXTO_TIPO = { dni: "DNI", celular: "Celular", cuenta: "Cuenta" };

const fecha = (v) => (v ? new Date(v).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "");

/**
 * Lista de bloqueo (migración 079): DNI, celulares y cuentas de casos
 * de fraude confirmados. Si vuelven a aparecer en otro cliente, su ficha
 * lo avisa. Solo supervisor y administrador.
 */
export default function ListaBloqueo({ onAviso, puedeEditar }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ tipo: "dni", valor: "", motivo: "" });
  const [guardando, setGuardando] = useState(false);
  const [confirmar, ventanaConfirmar] = useConfirmar();

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("lista_bloqueo")
      .select("id, tipo, valor, motivo, creado_en, cliente_id")
      .eq("activo", true)
      .order("creado_en", { ascending: false })
      .limit(300);
    if (e) {
      setError(e.code === "42P01" ? "Falta aplicar en Supabase la migración 20261119000079_identidad_bloqueo_duplicados.sql." : explicarError(e, "No se pudo leer la lista."));
      setFilas([]);
      return;
    }
    setFilas(data || []);
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function agregar(e) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    const { error: er } = await supabase.rpc("agregar_bloqueo", { p_tipo: form.tipo, p_valor: form.valor, p_motivo: form.motivo });
    setGuardando(false);
    if (er) return setError(er.code === "P0001" || er.code === "42501" ? er.message : explicarError(er, "No se pudo agregar."));
    setForm({ ...form, valor: "", motivo: "" });
    onAviso?.("Agregado a la lista de bloqueo.");
    cargar();
  }

  async function quitar(f) {
    const si = await confirmar({
      titulo: `¿Quitar ${TEXTO_TIPO[f.tipo]} ${f.valor} de la lista?`,
      texto: "Dejará de avisarse cuando aparezca en un cliente.",
      boton: "Quitar",
      tono: "atencion",
    });
    if (!si) return;
    const { error: er } = await supabase.rpc("quitar_bloqueo", { p_id: f.id });
    if (er) return setError(explicarError(er, "No se pudo quitar."));
    onAviso?.("Quitado de la lista de bloqueo.");
    cargar();
  }

  return (
    <div className="space-y-4">
      {error && <Aviso onCerrar={() => setError("")}>{error}</Aviso>}

      {puedeEditar && (
        <Panel titulo="Agregar a la lista" ayuda="Para bloquear a un cliente que ya existe, hazlo desde su ficha: ahí se pasan solos su DNI, celular y cuentas.">
          <form onSubmit={agregar} className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <Campo etiqueta="Tipo" htmlFor="tipoBloqueo">
              <Desplegable id="tipoBloqueo" variante="panel" valor={form.tipo} onCambio={(v) => setForm({ ...form, tipo: v })} opciones={TIPOS} />
            </Campo>
            <Campo etiqueta="Número" htmlFor="valorBloqueo">
              <input
                id="valorBloqueo"
                inputMode="numeric"
                value={form.valor}
                maxLength={30}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder={form.tipo === "dni" ? "Ej: 45678912" : form.tipo === "celular" ? "Ej: 987654321" : "Número de cuenta o CCI"}
                className="campo cifras"
              />
            </Campo>
            <Campo etiqueta="Motivo" htmlFor="motivoLista" className="sm:col-span-2">
              <input
                id="motivoLista"
                value={form.motivo}
                maxLength={200}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                placeholder="Ej: envió comprobantes falsos en la sede Norte."
                className="campo"
              />
            </Campo>
            <div className="flex justify-end sm:col-span-2">
              <BotonAccion type="submit" cargando={guardando} disabled={!form.valor.trim() || form.motivo.trim().length < 10}>
                Agregar
              </BotonAccion>
            </div>
          </form>
        </Panel>
      )}

      {filas === null ? (
        <EsqueletoFilas filas={4} />
      ) : filas.length === 0 ? (
        <Vacio icono={<Escudo />} titulo="La lista está vacía" detalle="Cuando bloquees a un cliente por fraude, sus datos quedan aquí para reconocerlo si vuelve con otra cuenta." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-4 py-2.5 t-etiqueta">Dato</th>
                  <th className="px-4 py-2.5 t-etiqueta">Motivo</th>
                  <th className="px-4 py-2.5 t-etiqueta">Desde</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-2.5">
                      <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">{TEXTO_TIPO[f.tipo]}</span>
                      <span className="cifras font-mono">{f.valor}</span>
                    </td>
                    <td className="max-w-[320px] px-4 py-2.5 text-muted-foreground">
                      <span className="line-clamp-2">{f.motivo}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{fecha(f.creado_en)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {puedeEditar && (
                        <BotonAccion tono="peligroSuave" tamano="chico" onClick={() => quitar(f)}>
                          Quitar
                        </BotonAccion>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {ventanaConfirmar}
    </div>
  );
}
