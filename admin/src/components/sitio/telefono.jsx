import { cn } from "@/lib/utils";

/**
 * Un teléfono con pantallas de la app dibujadas con código, no con
 * capturas: se ven nítidas en cualquier tamaño y no hay que rehacer
 * imágenes cada vez que cambia un detalle de la app.
 *
 * Los colores son los de la app (app/src/theme/tokens.js).
 */
export default function Telefono({ children, className }) {
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[9/19] w-[270px] rounded-[44px] border-[10px] border-[#0B1426] bg-[#0B1426] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]",
        className,
      )}
    >
      <div className="absolute left-1/2 top-2 z-20 h-[22px] w-[90px] -translate-x-1/2 rounded-full bg-[#0B1426]" />
      <div className="relative h-full overflow-hidden rounded-[34px] bg-[#EFF3F9]">{children}</div>
    </div>
  );
}

/* ── Piezas comunes de las pantallas ── */

function Cabecera({ titulo, sub }) {
  return (
    <div className="relative overflow-hidden bg-[#0F1B33] px-4 pb-5 pt-10">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#E8B800]/25 blur-2xl" />
      <div className="absolute -left-8 top-8 h-24 w-24 rounded-full bg-[#2F56B0]/40 blur-2xl" />
      {sub && <p className="relative text-[10px] font-semibold uppercase tracking-wider text-white/55">{sub}</p>}
      <p className="relative font-heading text-[17px] font-semibold text-white">{titulo}</p>
    </div>
  );
}

function Campo({ etiqueta, valor, lleno = true }) {
  return (
    <div className="rounded-xl border border-[#DCE3EE] bg-white px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-[#626D82]">{etiqueta}</p>
      <p className={cn("text-[12px] font-semibold", lleno ? "text-[#1B2A4A]" : "text-[#AFBCD0]")}>{valor}</p>
    </div>
  );
}

function Boton({ texto, oro = false }) {
  return (
    <div
      className={cn(
        "rounded-full py-2.5 text-center text-[12px] font-extrabold",
        oro ? "bg-[#E8B800] text-[#0F1B33]" : "bg-[#1B2A4A] text-white",
      )}
    >
      {texto}
    </div>
  );
}

function Marco({ etiqueta, listo, persona = false }) {
  return (
    <div
      className={cn(
        "flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border-2",
        listo ? "border-solid border-[#0B7F59] bg-[#E3F3EC]" : "border-dashed border-[#AFBCD0] bg-white",
      )}
    >
      {listo ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="#0B7F59" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : persona ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="#626D82" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="#626D82" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="11" r="2" />
          <path d="M14 10h4M14 14h4" />
        </svg>
      )}
      <p className="text-[9px] font-bold text-[#4F5B74]">{etiqueta}</p>
    </div>
  );
}

/* ── Pantallas ── */

export function PantallaRegistro() {
  return (
    <>
      <Cabecera sub="Paso 1 de 3" titulo="Crea tu cuenta" />
      <div className="space-y-2 p-3.5">
        <Campo etiqueta="Nombres" valor="María Fernanda" />
        <Campo etiqueta="Apellidos" valor="Quispe Rojas" />
        <div className="grid grid-cols-[70px_1fr] gap-2">
          <Campo etiqueta="Doc." valor="DNI" />
          <Campo etiqueta="Número" valor="12345678" />
        </div>
        <Campo etiqueta="Celular" valor="987 654 321" />
        <Campo etiqueta="Correo" valor="maria@correo.com" />
        <div className="flex items-center gap-2 px-1 py-1">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-[#1B2A4A] text-[8px] text-white">✓</span>
          <p className="text-[9.5px] text-[#4F5B74]">Acepto los términos y la política de privacidad</p>
        </div>
        <Boton texto="Continuar" />
      </div>
    </>
  );
}

export function PantallaIdentidad() {
  return (
    <>
      <Cabecera sub="Paso 2 de 3" titulo="Valida tu identidad" />
      <div className="space-y-2.5 p-3.5">
        <p className="text-[11px] leading-snug text-[#4F5B74]">Fotos claras, con buena luz y sin reflejos.</p>
        <div className="grid grid-cols-2 gap-2">
          <Marco etiqueta="DNI frente" listo />
          <Marco etiqueta="DNI reverso" listo />
        </div>
        <Marco etiqueta="Selfie con tu DNI" persona />
        <div className="flex items-center gap-2 rounded-xl bg-[#E6EBF5] px-3 py-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="#2C4270" strokeWidth="2" strokeLinecap="round" className="h-4 w-4 shrink-0">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <p className="text-[9.5px] font-semibold leading-snug text-[#2C4270]">Tus fotos se guardan cifradas.</p>
        </div>
        <Boton texto="Enviar a revisión" />
      </div>
    </>
  );
}

export function PantallaTarjeta() {
  return (
    <>
      <Cabecera sub="Mis tarjetas" titulo="Registra tu tarjeta" />
      <div className="space-y-3 p-3.5">
        <div className="relative aspect-[1.586] overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F1B33] via-[#1B2A4A] to-[#2C4270] p-3.5 text-white shadow-lg">
          <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-[#E8B800]/30 blur-xl" />
          <div className="flex items-center justify-between">
            <span className="rounded bg-[#E67E00] px-1.5 py-0.5 text-[9px] font-extrabold text-[#0F1B33]">BCP</span>
            <span className="h-5 w-7 rounded bg-gradient-to-br from-[#F5D976] to-[#C49B00]" />
          </div>
          <p className="mt-5 font-mono text-[13px] tracking-[0.18em]">•••• •••• •••• 4821</p>
          <p className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-white/70">María F. Quispe R.</p>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-[#FFF3CC] px-3 py-2">
          <span className="text-[11px] font-black text-[#6E5300]">!</span>
          <p className="text-[9.5px] font-semibold leading-snug text-[#6E5300]">Tapa el número: solo deben verse los últimos 4 dígitos y tu nombre.</p>
        </div>
        <Campo etiqueta="Últimos 4 dígitos" valor="4821" />
        <Boton texto="Registrar tarjeta" />
      </div>
    </>
  );
}

export function PantallaCuenta() {
  return (
    <>
      <Cabecera sub="Mis cuentas" titulo="¿Dónde te depositamos?" />
      <div className="space-y-2 p-3.5">
        {[
          { b: "BCP", t: "Ahorros", n: "191-•••••••-0-48", c: "#E67E00", tc: "#0F1B33", ok: true },
          { b: "Interbank", t: "Ahorros", n: "898-•••••••-12", c: "#00855A", tc: "#fff" },
        ].map((x) => (
          <div key={x.b} className="flex items-center gap-2.5 rounded-xl border border-[#E3E9F2] bg-white p-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[8px] font-extrabold" style={{ background: x.c, color: x.tc }}>
              {x.b.slice(0, 3).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-[#1B2A4A]">
                {x.b} · {x.t}
              </p>
              <p className="font-mono text-[10px] text-[#626D82]">{x.n}</p>
            </div>
            {x.ok && <span className="rounded-full bg-[#E3F3EC] px-1.5 py-0.5 text-[8px] font-bold text-[#0B6B4B]">Titular</span>}
          </div>
        ))}
        <div className="rounded-xl border-2 border-dashed border-[#AFBCD0] py-2.5 text-center text-[11px] font-bold text-[#4F5B74]">+ Agregar cuenta</div>
        <p className="px-1 text-[9.5px] leading-snug text-[#626D82]">La cuenta debe estar a tu nombre. Puedes registrar más de una.</p>
      </div>
    </>
  );
}

export function PantallaSolicitud() {
  return (
    <>
      <Cabecera sub="Nueva solicitud" titulo="Envía tu comprobante" />
      <div className="space-y-2.5 p-3.5">
        <p className="text-[9px] font-bold uppercase tracking-wide text-[#626D82]">Tarjeta</p>
        <div className="flex gap-1.5">
          <span className="rounded-full bg-[#1B2A4A] px-2.5 py-1 text-[10px] font-bold text-white">BCP ···· 4821</span>
          <span className="rounded-full border border-[#DCE3EE] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#4F5B74]">BBVA ···· 1290</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-[#E3E9F2] bg-white p-2.5">
          <span className="flex h-10 w-8 items-center justify-center rounded-md bg-[#E6EBF5] text-[#2C4270]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
          </span>
          <div>
            <p className="text-[11px] font-bold text-[#1B2A4A]">comprobante.jpg</p>
            <p className="text-[9.5px] text-[#0B6B4B]">Listo para enviar</p>
          </div>
        </div>
        <div className="rounded-xl bg-[#0F1B33] p-3 text-white">
          <div className="flex justify-between text-[10px] text-white/60">
            <span>Comisión BCP</span>
            <span className="font-bold text-[#E8B800]">1 %</span>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-white/60">
            <span>Depósito</span>
            <span className="font-semibold text-white">Normalmente en 1 hora</span>
          </div>
        </div>
        <Boton texto="Enviar solicitud" oro />
      </div>
    </>
  );
}

export function PantallaPagado() {
  return (
    <>
      <Cabecera sub="Hola, María" titulo="Mis solicitudes" />
      <div className="space-y-2 p-3.5">
        <div className="rounded-2xl bg-[#0B7F59] p-3.5 text-white shadow-lg">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />
              </svg>
            </span>
            <p className="text-[12px] font-extrabold">Pago enviado</p>
          </div>
          <p className="mt-2 text-[10px] text-white/80">Depositado en tu cuenta BCP ···· 48</p>
          <p className="font-mono text-[10px] text-white/60">SOL-00412 · hace 5 min</p>
        </div>
        {[
          { c: "SOL-00398", e: "Pago enviado", bg: "#E3F3EC", fg: "#0B6B4B" },
          { c: "SOL-00371", e: "Pago enviado", bg: "#E3F3EC", fg: "#0B6B4B" },
          { c: "SOL-00355", e: "Aprobado", bg: "#FFF3CC", fg: "#6E5300" },
        ].map((x) => (
          <div key={x.c} className="flex items-center justify-between rounded-xl border border-[#E3E9F2] bg-white px-3 py-2.5">
            <div>
              <p className="font-mono text-[10.5px] font-bold text-[#1B2A4A]">{x.c}</p>
              <p className="text-[9.5px] text-[#626D82]">BCP ···· 4821</p>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: x.bg, color: x.fg }}>
              {x.e}
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-3.5 bottom-4">
        <Boton texto="+ Nueva solicitud" oro />
        <div className="mt-3 flex justify-around border-t border-[#E3E9F2] pt-2.5 text-[9px] font-bold text-[#8A93A6]">
          <span className="text-[#1B2A4A]">Inicio</span>
          <span>Tarjetas</span>
          <span>Noticias</span>
          <span>Cuenta</span>
        </div>
      </div>
    </>
  );
}
