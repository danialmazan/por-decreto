import datetime as dt
import unittest

from pipeline import build, series
from pipeline.sources import boe


class TestTitulos(unittest.TestCase):
    def test_variantes(self):
        casos = {
            "Real Decreto-ley 1/2024, de 14 de mayo, por el que": (1, 2024, "2024-05-14"),
            "Real decreto-ley 2/1986, de 23 de mayo, sobre": (2, 1986, "1986-05-23"),
            "Real Decreto-ley 8/1994 de 5 de agosto, de supresión": (8, 1994, "1994-08-05"),
            "Real Decreto-ley 5/2001, de 2 marzo, de Medidas": (5, 2001, "2001-03-02"),
            "Real Decreto-ley 50/1978, de 29 de diciembre, sobre": (50, 1978, "1978-12-29"),
            "Ley Orgánica 1/2024, de 10 de junio, de Amnistía": (1, 2024, "2024-06-10"),
            "Real Decreto Legislativo 1/2013, de 29 de noviembre, por": (1, 2013, "2013-11-29"),
        }
        for t, (n, y, f) in casos.items():
            p = boe.parse_titulo(t)
            self.assertEqual((p["numero"], p["anio"], p["fecha"]), (n, y, f), t)

    def test_fecha_en_texto(self):
        self.assertEqual(boe.fecha_en_texto(", por Resolución de 13 de junio de 2024"), "2024-06-13")
        self.assertEqual(boe.fecha_en_texto("el domingo 29 de noviembre de 2026."), "2026-11-29")
        self.assertIsNone(boe.fecha_en_texto("sin fecha"))


class TestResultados(unittest.TestCase):
    def test_congreso(self):
        self.assertEqual(build.norm_resultado("Convalidado"), ("convalidado", "no"))
        self.assertEqual(build.norm_resultado("CONVALIDADO Y TRAMITADO COMO PROYECTO DE LEY"), ("convalidado", "si"))
        self.assertEqual(build.norm_resultado("Derogado"), ("derogado", "no"))
        self.assertIsNone(build.norm_resultado(""))

    def test_boe_distingue_derogacion_parlamentaria(self):
        doc = {"referencias": [
            {"tipo": "posterior", "codigo": "210", "palabra": "SE DEROGA", "texto": ", por Ley 3/1990, de 5 de mayo"},
            {"tipo": "posterior", "codigo": "301", "palabra": "SE PUBLICA Acuerdo de convalidación",
             "texto": ", por Resolución de 13 de junio de 2024"}]}
        self.assertEqual(build.boe_resultado(doc), ("convalidado", "2024-06-13"))
        doc["referencias"].append({"tipo": "posterior", "codigo": "210", "palabra": "SE DEROGA", "referencia": "X",
                                   "texto": ", por Resolución de 10 de enero de 2024"})
        # Resolución que no es del Congreso (p. ej. de un ministerio): no es derogación parlamentaria
        self.assertEqual(build.boe_resultado(doc, verificar=lambda _: False), ("convalidado", "2024-06-13"))
        self.assertEqual(build.boe_resultado(doc, verificar=lambda _: True), ("derogado", "2024-01-10"))

    def test_pl(self):
        self.assertEqual(build.norm_resultado_pl("Aprobado con modificaciones \n10/09/2024"), ("aprobado", "2024-09-10"))
        self.assertEqual(build.norm_resultado_pl("Caducado"), ("caducado", None))
        self.assertEqual(build.norm_resultado_pl(""), ("en_tramitacion", None))


class TestSerie(unittest.TestCase):
    def setUp(self):
        self.f = ["2024-02-28", "2024-02-29", "2024-03-01", "2024-03-01", "2024-03-30"]
        self.s = series.serie_diaria(self.f, dt.date(2024, 2, 1), dt.date(2024, 3, 31))

    def test_ceros_explicitos_y_suma(self):
        self.assertEqual(len(self.s), 60)  # 2024 es bisiesto: 29 días de febrero + 31 de marzo
        self.assertEqual(sum(r["n"] for r in self.s), len(self.f))
        self.assertEqual(next(r for r in self.s if r["fecha"] == "2024-02-15")["n"], 0)

    def test_ventana_30_incluye_dia_y_29_anteriores(self):
        r = next(r for r in self.s if r["fecha"] == "2024-03-29")  # ventana 29/02–29/03
        self.assertEqual(r["m30"], 3)
        r = next(r for r in self.s if r["fecha"] == "2024-03-30")  # ventana 01/03–30/03
        self.assertEqual(r["m30"], 3)
        r = next(r for r in self.s if r["fecha"] == "2024-03-28")  # ventana 28/02–28/03
        self.assertEqual(r["m30"], 4)

    def test_semana_iso(self):
        r = next(r for r in self.s if r["fecha"] == "2024-03-01")
        self.assertEqual((r["iso_anio"], r["iso_semana"]), (2024, 9))
        s = series.serie_diaria([], dt.date(2020, 12, 28), dt.date(2021, 1, 3))
        self.assertTrue(all(x["iso_semana"] == 53 and x["iso_anio"] == 2020 for x in s))

    def test_segmento_no_atribuye_otro_gobierno(self):
        seg = lambda d: "A" if d < dt.date(2024, 3, 1) else "B"  # noqa: E731
        s = series.serie_diaria(self.f, dt.date(2024, 2, 1), dt.date(2024, 3, 31), segmento=seg)
        r = next(r for r in s if r["fecha"] == "2024-03-01")
        self.assertEqual((r["m30"], r["m30_seg"]), (4, 2))


class TestFases(unittest.TestCase):
    legs = [
        {"legislatura": 14, "fecha_constitucion": "2019-12-03", "fecha_disolucion": "2023-05-30", "fecha_elecciones": "2019-11-10"},
        {"legislatura": 15, "fecha_constitucion": "2023-08-17", "fecha_elecciones": "2023-07-23"},
    ]
    gobs = [{"gobierno_id": "s2", "presidente_id": "s", "presidente": "S", "partidos": "PSOE;UP",
             "fecha_inicio": "2020-01-07", "fecha_fin": "2023-11-15", "inicio_funciones": "2023-07-23"},
            {"gobierno_id": "s3", "presidente_id": "s", "presidente": "S", "partidos": "PSOE;SUMAR",
             "fecha_inicio": "2023-11-16", "fecha_fin": None, "inicio_funciones": None}]

    def test_fases(self):
        f = lambda s: build.fase_y_contexto(dt.date.fromisoformat(s), self.legs, self.gobs)  # noqa: E731
        self.assertEqual(f("2023-05-29")[2], "ordinaria")
        self.assertEqual(f("2023-06-27")[2], "cortes_disueltas")
        self.assertEqual(f("2023-07-23")[2], "en_funciones")
        g, leg, fase = f("2023-11-16")
        self.assertEqual((g["gobierno_id"], leg["legislatura"], fase), ("s3", 15, "ordinaria"))
        self.assertEqual(f("2023-08-01")[1]["legislatura"], 14)  # antes de constituirse las nuevas Cortes
        _, _, dis, fun = build.contexto(dt.date(2023, 8, 1), self.legs, self.gobs)
        self.assertEqual((dis, fun), (True, True))  # disueltas hasta la constitución; en funciones desde elecciones
        self.assertEqual(build.contexto(dt.date(2023, 8, 17), self.legs, self.gobs)[2:], (False, True))


if __name__ == "__main__":
    unittest.main()


class TestMetricas(unittest.TestCase):
    def test_grupo_basico(self):
        from pipeline import metrics
        d = dt.date
        # Del miércoles 3/1/2024 al domingo 4/2/2024: semanas ISO completas = W02..W05 (4)
        ivs = [(d(2024, 1, 3), d(2024, 2, 4))]
        f = [d(2024, 1, 3), d(2024, 1, 10), d(2024, 1, 10), d(2024, 2, 1)]
        m = metrics.metricas_grupo(ivs, f)
        self.assertEqual(m["n"], 4)
        self.assertEqual(m["dias_exposicion"], 33)
        self.assertEqual(m["semanas_completas"], 4)
        self.assertEqual(m["pct_semanas_sin_rdl"], 50.0)   # W02 y W05 con RDL; W03, W04 sin
        self.assertEqual(m["meses_completos"], 0)          # enero incompleto (empieza el 3)
        self.assertEqual((m["max_semana"], m["max_semana_id"]), (2, "2024-W02"))
        self.assertEqual(m["max_30d"], 4)  # 03/01–01/02 son 30 días
        self.assertEqual(m["dias_entre_aprobaciones_mediana"], 14.5)  # huecos 7 y 22
        self.assertAlmostEqual(m["media_anualizada"], 4 / (33 / 365.25), places=2)

    def test_huecos_entre_tramos_no_contiguos(self):
        from pipeline import metrics
        d = dt.date
        ivs = [(d(2000, 1, 1), d(2000, 1, 31)), (d(2004, 1, 1), d(2004, 1, 31))]
        m = metrics.metricas_grupo(ivs, [d(2000, 1, 10), d(2000, 1, 20), d(2004, 1, 5)])
        self.assertEqual(m["dias_entre_aprobaciones_media"], 10)  # no cuenta el salto 2000→2004

    def test_exclusion(self):
        from pipeline import metrics
        d = dt.date
        ivs = [(d(2020, 1, 1), d(2020, 12, 31))]
        excl = {d(2020, 3, 1) + dt.timedelta(days=k) for k in range(100)}
        m = metrics.metricas_grupo(ivs, [d(2020, 1, 5), d(2020, 3, 10)], excluir=excl)
        self.assertEqual((m["n"], m["dias_exposicion"]), (1, 266))
