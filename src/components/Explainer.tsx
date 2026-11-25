import { useLang } from "../i18n";

type Termino = "aprobado" | "convalidado" | "derogado" | "pendiente" | "tramitado" | "ley_aprobada" | "caducado" | "subsumido" | "en_tramitacion"
  | "decreto_ley" | "ley" | "ley_organica" | "rdleg";

const G: Record<"es" | "en", Record<Termino, [string, string]>> = {
  es: {
    aprobado: ["Aprobado", "El Consejo de Ministros aprueba el decreto-ley y entra en vigor al publicarse en el BOE, sin esperar al Congreso."],
    convalidado: ["Convalidado", "El Congreso (o su Diputación Permanente, si las Cortes están disueltas) vota a favor en una votación única sobre el conjunto, sin enmiendas, dentro de los 30 días siguientes. El decreto-ley sigue en vigor."],
    derogado: ["Derogado por el Congreso", "El Congreso vota en contra en ese plazo y el decreto-ley deja de estar en vigor. No es lo mismo que la derogación posterior por otra norma."],
    pendiente: ["Pendiente", "Todavía no consta la votación de convalidación, normalmente porque el plazo de 30 días aún no ha vencido."],
    tramitado: ["Tramitado como proyecto de ley", "Tras convalidarlo, el Congreso puede acordar tramitarlo como proyecto de ley por la vía de urgencia. Así se abre la puerta a enmiendas. Es una decisión distinta de la convalidación."],
    ley_aprobada: ["Ley aprobada", "La tramitación termina con una ley de las Cortes, que normalmente sustituye al decreto-ley."],
    caducado: ["Caducado", "El proyecto de ley decae sin aprobarse, casi siempre porque se disuelven las Cortes. El decreto-ley convalidado sigue en vigor."],
    subsumido: ["Subsumido", "El contenido del proyecto se integra en otra iniciativa legislativa."],
    en_tramitacion: ["En tramitación", "El proyecto de ley sigue abierto en las Cortes."],
    decreto_ley: ["Real decreto-ley", "Norma con rango de ley que aprueba el Gobierno en caso de extraordinaria y urgente necesidad (art. 86 de la Constitución). Es provisional hasta que el Congreso la convalida."],
    ley: ["Ley ordinaria", "La aprueban las Cortes Generales (Congreso y Senado) por mayoría simple."],
    ley_organica: ["Ley orgánica", "Ley de las Cortes que exige mayoría absoluta del Congreso en una votación final sobre el conjunto. Se reserva a materias como los derechos fundamentales, los estatutos de autonomía o el régimen electoral (art. 81)."],
    rdleg: ["Real decreto legislativo", "Norma con rango de ley que dicta el Gobierno por delegación expresa de las Cortes, normalmente para refundir o articular leyes (arts. 82 a 85). No requiere urgencia."],
  },
  en: {
    aprobado: ["Approved", "The Council of Ministers approves the decree-law, which takes effect once published in the BOE, without waiting for Congress."],
    convalidado: ["Validated", "Congress (or its Standing Committee if the Cortes are dissolved) votes in favour in a single up-or-down vote, with no amendments, within 30 days. The decree-law stays in force."],
    derogado: ["Repealed by Congress", "Congress votes against it within that period and the decree-law ceases to be in force. This differs from a later repeal by another norm."],
    pendiente: ["Pending", "The validation vote is not yet on record, usually because the 30-day period has not ended."],
    tramitado: ["Processed as a bill", "After validating it, Congress can agree to process it as an urgent government bill, which allows amendments. It is a decision separate from validation."],
    ley_aprobada: ["Law passed", "The process ends with an act of the Cortes, which usually replaces the decree-law."],
    caducado: ["Lapsed", "The bill falls without being passed, almost always because the Cortes are dissolved. The validated decree-law remains in force."],
    subsumido: ["Merged", "The bill's content is folded into another legislative initiative."],
    en_tramitacion: ["In progress", "The bill is still open in the Cortes."],
    decreto_ley: ["Royal decree-law", "A norm with the force of law approved by the Government in cases of extraordinary and urgent need (art. 86 of the Constitution). It is provisional until Congress validates it."],
    ley: ["Ordinary law", "Passed by the Cortes Generales (Congress and Senate) by simple majority."],
    ley_organica: ["Organic law", "A law of the Cortes requiring an absolute majority of Congress in a final vote on the whole. Reserved for matters such as fundamental rights, regional statutes of autonomy or electoral law (art. 81)."],
    rdleg: ["Royal legislative decree", "A norm with the force of law issued by the Government under an express delegation from the Cortes, usually to consolidate or develop laws (arts. 82–85). It requires no urgency."],
  },
};

export function Glosario({ terminos, titulo }: { terminos: Termino[]; titulo?: string }) {
  const l = useLang();
  return (
    <details className="glosario">
      <summary>{titulo ?? (l === "es" ? "¿Qué significa cada término?" : "What does each term mean?")}</summary>
      <dl>{terminos.map((k) => <div key={k}><dt>{G[l][k][0]}</dt><dd>{G[l][k][1]}</dd></div>)}</dl>
    </details>
  );
}

/** Desplegable inicial: qué es un decreto-ley, para qué existe y por qué se discute su uso. */
export function QueEsDecretoLey() {
  const l = useLang();
  if (l === "en") return (
    <details className="explainer">
      <summary>What is a decree-law and why does its use matter?</summary>
      <div className="explainer-body">
        <div><h3>What it is</h3><p>Under article 86 of the Spanish Constitution, the Government may approve norms with the force of law “in cases of extraordinary and urgent need”. They take effect immediately, but are provisional: Congress must validate or repeal them within 30 days in a single vote on the whole text. They cannot affect the basic institutions of the State, the rights and duties of Title I, the regional system or general electoral law.</p></div>
        <div><h3>What it is for</h3><p>It is designed as an exceptional tool for situations that cannot wait for the ordinary legislative process, with parliamentary control afterwards. Natural disasters, financial emergencies or the pandemic are typical examples.</p></div>
        <div><h3>Why its frequent use is debated</h3><p>Because it takes effect at once and Congress can only accept or reject it as a whole, it reduces debate and amendments. It also allows unrelated matters to be bundled into one “omnibus” decree and can make up for the lack of a stable majority to pass laws. The Constitutional Court requires the urgency to be justified and has struck down decree-laws that did not justify it (for example, judgment 68/2007). Their frequent use also responds to real crises, late transposition of EU directives and parliamentary fragmentation: the figures on this page describe how often it is used, not whether each use was justified.</p></div>
      </div>
    </details>
  );
  return (
    <details className="explainer">
      <summary>¿Qué es un decreto-ley y por qué importa cuánto se usa?</summary>
      <div className="explainer-body">
        <div><h3>Qué es</h3><p>Según el artículo 86 de la Constitución, el Gobierno puede aprobar normas con rango de ley «en caso de extraordinaria y urgente necesidad». Entran en vigor de inmediato, pero son provisionales: el Congreso debe convalidarlas o derogarlas en los 30 días siguientes, en una votación única sobre el conjunto. No pueden afectar a las instituciones básicas del Estado, a los derechos y deberes del Título I, al régimen de las comunidades autónomas ni al derecho electoral general.</p></div>
        <div><h3>Para qué existe</h3><p>Está pensado como una herramienta excepcional para situaciones que no pueden esperar al procedimiento legislativo ordinario, con control parlamentario posterior. Catástrofes, emergencias financieras o la pandemia son ejemplos típicos.</p></div>
        <div><h3>Por qué se discute su uso frecuente</h3><p>Como entra en vigor al momento y el Congreso sólo puede aceptarlo o rechazarlo en bloque, reduce el debate y las enmiendas. Además, permite agrupar materias sin relación en un mismo decreto «ómnibus» y puede suplir la falta de una mayoría estable para aprobar leyes. El Tribunal Constitucional exige que la urgencia esté justificada y ha anulado decretos-leyes que no lo hacían (por ejemplo, la STC 68/2007). Su uso frecuente también responde a crisis reales, a la transposición tardía de directivas europeas y a la fragmentación parlamentaria: las cifras de esta web describen cuánto se usa, no si cada uso estaba justificado.</p></div>
      </div>
    </details>
  );
}
