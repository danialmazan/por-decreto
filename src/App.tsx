import { useEffect, useState } from "react";
import { useDatos, type Datos } from "./data";
import { fmtDia, LangCtx, useT, type Lang } from "./i18n";
import { toDay } from "./lib/time";
import { Hero } from "./components/Hero";
import { Seismograph } from "./components/Seismograph";
import { WeekCalendar } from "./components/WeekCalendar";
import { EndOfTerm } from "./components/EndOfTerm";
import { Comparison } from "./components/Comparison";
import { Profiles } from "./components/Profiles";
import { Chapter, Section } from "./components/ui";
import { QueEsDecretoLey } from "./components/Explainer";
import { Outcomes } from "./components/Outcomes";
import { Production } from "./components/Production";
import { Majority } from "./components/Majority";
import { ContextSection } from "./components/Context";
import { Explorer } from "./components/Explorer";

const Icon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <rect width="24" height="24" rx="5" fill="var(--ink)" />
    <path d="M3 15h4l2-6 3 9 2-5h3" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="19.5" cy="13" r="2.2" fill="var(--pen)" />
  </svg>
);

function TopBar({ lang }: { lang: Lang }) {
  const t = useT();
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); addEventListener("querychange", f); return () => removeEventListener("querychange", f); }, []);
  const base = import.meta.env.BASE_URL;
  const q = location.search + location.hash;
  const toggleTheme = () => {
    const r = document.documentElement, dark = r.dataset.theme === "dark";
    r.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("tema", r.dataset.theme); } catch { /* sin almacenamiento */ }
  };
  return (
    <header className="topbar">
      <a className="brand" href={lang === "es" ? base : `${base}en/`}>{t.titulo} <Icon /></a>
      <div className="tools">
        <nav className="lang" aria-label={t.idioma}>
          <a href={`${base}${q}`} lang="es" hrefLang="es" aria-current={lang === "es"} title="Español">ES</a>
          <a href={`${base}en/${q}`} lang="en" hrefLang="en" aria-current={lang === "en"} title="English">EN</a>
        </nav>
        <button type="button" className="theme" onClick={toggleTheme} aria-label={t.tema}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5" /><path d="M12 7v10a5 5 0 0 0 0-10z" fill="currentColor" /></svg>
        </button>
      </div>
    </header>
  );
}

function Indice() {
  const t = useT();
  return (
    <nav className="indice" aria-label={t.indice}>
      <a href="#inicio">{t.inicio}</a>
      {Object.entries(t.capitulos).map(([id, c], i) => <a key={id} href={`#${id}`}><span className="n">{i + 1}</span> {c.corto}</a>)}
    </nav>
  );
}

function Metodo({ datos }: { datos: Datos }) {
  const t = useT(), lang = document.documentElement.lang as Lang;
  const base = import.meta.env.BASE_URL;
  const cob = datos.meta.cobertura;
  const es = lang === "es";
  return (
    <Section id="metodo" title={t.metodoTitulo} className="narrow">
      <div className="prose">
        {es ? <>
          <h3 className="sub">Qué se cuenta</h3>
          <p>Los <b>reales decretos-leyes estatales</b> aprobados desde el 29 de diciembre de 1978, fecha de entrada en vigor de la Constitución, por su <b>fecha de aprobación</b> en el Consejo de Ministros (no la de publicación). Se excluyen reales decretos ordinarios, decretos legislativos, decretos-leyes autonómicos, correcciones de errores y duplicados.</p>
          <h3 className="sub">Fuentes</h3>
          <p>Lista: buscador de legislación del <a href="https://www.boe.es/buscar/legislacion.php">BOE</a> (incluye normas derogadas), contrastada año a año con las estadísticas del <a href="https://app.congreso.es/est_leyes/">Congreso</a>. Resultado parlamentario: expedientes del Congreso y resoluciones publicadas en el BOE. Gobiernos: reales decretos de nombramiento y cese. Legislaturas y elecciones: reales decretos de disolución y convocatoria. Escaños: registro de diputados del Congreso. Contexto: fuentes citadas en cada acontecimiento.</p>
          <h3 className="sub">Definiciones</h3>
          <p>Cada decreto-ley se asigna al Gobierno que lo aprobó, incluidos los periodos en funciones (desde las elecciones hasta el nombramiento del nuevo presidente). Las medias usan la duración efectiva de cada mandato. La ventana móvil de 30 días incluye el día seleccionado y los 29 anteriores; al filtrar un Gobierno sólo cuenta sus propios decretos-leyes. Los periodos naturales incompletos se marcan. Las Cortes están disueltas desde la entrada en vigor del real decreto de disolución hasta la constitución de las nuevas.</p>
          <h3 className="sub">Denominadores y límites</h3>
          <p>Los porcentajes de convalidación y derogación se calculan sobre los decretos-leyes con decisión (se excluyen los pendientes). La tramitación como proyecto de ley es una decisión independiente de la convalidación. El peso de los decretos-leyes mide la composición de la producción normativa, no la calidad democrática. La relación con la mayoría parlamentaria es descriptiva. Excluir periodos es un ejercicio de sensibilidad temporal, no una clasificación temática.</p>
        </> : <>
          <h3 className="sub">What is counted</h3>
          <p><b>State royal decree-laws</b> approved since 29 December 1978, when the Constitution came into force, by their <b>approval date</b> in the Council of Ministers (not publication). Ordinary royal decrees, legislative decrees, regional decree-laws, corrections and duplicates are excluded.</p>
          <h3 className="sub">Sources</h3>
          <p>List: <a href="https://www.boe.es/buscar/legislacion.php">BOE</a> legislation search (including repealed norms), checked year by year against <a href="https://app.congreso.es/est_leyes/">Congress</a> statistics. Parliamentary outcome: Congress records and resolutions published in the BOE. Governments: royal decrees of appointment and dismissal. Legislatures and elections: dissolution and election decrees. Seats: Congress register of deputies. Context: sources cited for each event.</p>
          <h3 className="sub">Definitions</h3>
          <p>Each decree-law is assigned to the government that approved it, including caretaker periods (from the election to the appointment of the new prime minister). Averages use the effective length of each term. The 30-day rolling window includes the selected day and the previous 29; when a government is filtered, only its own decree-laws count. Incomplete calendar periods are flagged. The Cortes are dissolved from the entry into force of the dissolution decree until the new chambers convene.</p>
          <h3 className="sub">Denominators and limits</h3>
          <p>Validation and repeal shares are computed over decree-laws with a decision (pending ones are excluded). Processing as a bill is a decision independent of validation. The share of decree-laws measures the composition of legislative output, not democratic quality. The link with parliamentary majorities is descriptive. Excluding periods is a time-sensitivity exercise, not a thematic classification.</p>
        </>}
        <p className="note">{t.actualizado(fmtDia(toDay(datos.meta.generado.slice(0, 10)), lang), fmtDia(toDay(String(cob.listado_boe_hasta)), lang))}</p>
        <p><a className="button" href={`${base}data/decretos-leyes.csv`} download>{t.descarga}</a></p>
      </div>
    </Section>
  );
}

export function App({ lang }: { lang: Lang }) {
  const { datos, error } = useDatos();
  return (
    <LangCtx.Provider value={lang}>
      <Shell lang={lang} datos={datos} error={error} />
    </LangCtx.Provider>
  );
}

function Shell({ lang, datos, error }: { lang: Lang; datos?: Datos; error?: string }) {
  const t = useT();
  // Las secciones se pintan tras cargar los datos: al llegar con #ancla, desplazarse cuando existan.
  useEffect(() => {
    if (!datos || !location.hash) return;
    // Algunas secciones cargan datos diferidos y cambian de altura: se repite el desplazamiento cuando se asientan.
    const ir = () => document.getElementById(location.hash.slice(1))?.scrollIntoView();
    const ts = [0, 400, 1200].map((ms) => setTimeout(ir, ms));
    return () => ts.forEach(clearTimeout);
  }, [datos]);
  return (
    <>
      <TopBar lang={lang} />
      <main>
        {error && <p className="error" role="alert">{t.error}</p>}
        {!datos && !error && <p className="loading">{t.cargando}</p>}
        {datos && <>
          <div className="hero" id="inicio">
            <Hero datos={datos} />
            <QueEsDecretoLey />
            <Seismograph datos={datos} />
          </div>
          <Indice />
          <Chapter id="ritmo" n={1} title={t.capitulos.ritmo.titulo} intro={t.capitulos.ritmo.intro}>
            <Section id="calendario" title={t.calTitulo}><WeekCalendar datos={datos} /></Section>
          </Chapter>
          <Chapter id="mandatos" n={2} title={t.capitulos.mandatos.titulo} intro={t.capitulos.mandatos.intro}>
            <Comparison datos={datos} />
            <Profiles datos={datos} />
            <Majority datos={datos} />
          </Chapter>
          <Chapter id="elecciones" n={3} title={t.capitulos.elecciones.titulo} intro={t.capitulos.elecciones.intro}>
            <EndOfTerm datos={datos} />
          </Chapter>
          <Chapter id="congreso" n={4} title={t.capitulos.congreso.titulo} intro={t.capitulos.congreso.intro}>
            <Outcomes datos={datos} />
          </Chapter>
          <Chapter id="normas" n={5} title={t.capitulos.normas.titulo} intro={t.capitulos.normas.intro}>
            <Production datos={datos} />
          </Chapter>
          <Chapter id="contexto-cap" n={6} title={t.capitulos["contexto-cap"].titulo} intro={t.capitulos["contexto-cap"].intro}>
            <ContextSection datos={datos} />
          </Chapter>
          <Chapter id="datos" n={7} title={t.capitulos.datos.titulo} intro={t.capitulos.datos.intro}>
            <Explorer datos={datos} />
            <Metodo datos={datos} />
          </Chapter>
        </>}
      </main>
      <footer>
        <a className="author" href="https://danielalmazan.com">danielalmazan.com</a>
        <span className="credit">{t.pie} <a href="#metodo">{t.fuentes}</a></span>
        <span className="fbrand">{t.titulo} <Icon /></span>
      </footer>
    </>
  );
}
