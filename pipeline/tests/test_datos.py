"""Comprobaciones sobre las tablas limpias (se omiten si aún no se han construido)."""
import csv
import collections
import unittest
from pathlib import Path

CLEAN = Path(__file__).resolve().parents[2] / "data" / "clean"


def load(name):
    with open(CLEAN / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


@unittest.skipUnless((CLEAN / "rdl.csv").exists(), "sin data/clean")
class TestDatos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rdl = {(int(r["numero"]), int(r["anio"])): r for r in load("rdl.csv")}
        cls.gob = {g["gobierno_id"]: g for g in load("gobiernos.csv")}

    def test_casos_conocidos(self):
        r = self.rdl[(4, 2017)]  # estiba: derogado por el Congreso
        self.assertEqual((r["convalidacion"], r["fecha_convalidacion"]), ("derogado", "2017-03-16"))
        r = self.rdl[(7, 2023)]
        self.assertEqual((r["convalidacion"], r["fecha_convalidacion"]), ("derogado", "2024-01-10"))
        r = self.rdl[(1, 2024)]
        self.assertEqual((r["convalidacion"], r["fecha_convalidacion"]), ("convalidado", "2024-06-13"))
        r = self.rdl[(3, 2008)]  # «SE DEROGA por Resolución» de un órgano que no es el Congreso
        self.assertEqual(r["convalidacion"], "convalidado")
        self.assertEqual(self.rdl[(50, 1978)]["fecha_aprobacion"], "1978-12-29")

    def test_asignaciones(self):
        self.assertEqual(self.rdl[(20, 2011)]["gobierno_id"], "rajoy_1")  # 30/12/2011
        self.assertEqual(self.rdl[(1, 2020)]["gobierno_id"], "sanchez_2")
        self.assertEqual(self.rdl[(28, 2026)]["fase"], "cortes_disueltas")
        self.assertEqual(self.rdl[(27, 2026)]["fase"], "ordinaria")  # 29/09/2026, antes de la disolución

    def test_escanos(self):
        esperados = {"suarez_3": 168, "gonzalez_1": 202, "gonzalez_3": 175, "aznar_1": 156, "aznar_2": 183,
                     "rajoy_1": 186, "rajoy_2": 137, "sanchez_1": 85, "sanchez_2": 155, "sanchez_3": 152}
        for g, n in esperados.items():
            self.assertEqual(int(self.gob[g]["escanos_gobierno"]), n, g)
        self.assertEqual(self.gob["gonzalez_3"]["mayoria_absoluta"], "False")  # 175 < 176

    def test_serie(self):
        s = load("serie_diaria.csv")
        self.assertEqual(sum(int(x["n"]) for x in s), len(self.rdl))
        self.assertEqual(s[0]["fecha"], "1978-12-29")
        c = collections.Counter(x["fecha"][:4] for x in s)
        self.assertEqual(c["1980"], 366)
        self.assertEqual(c["2000"], 366)


class TestManual(unittest.TestCase):
    """Tablas curadas: fechas válidas, ordenadas y con fuente (no se aceptan filas sin fuente)."""

    def _csv(self, name):
        p = Path(__file__).resolve().parents[2] / "data" / "manual" / name
        with open(p, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def test_eventos(self):
        import datetime as dt
        ids = set()
        for e in self._csv("eventos.csv"):
            self.assertNotIn(e["id"], ids); ids.add(e["id"])
            a = dt.date.fromisoformat(e["inicio"])
            if e["fin"]:
                self.assertLessEqual(a, dt.date.fromisoformat(e["fin"]), e["id"])
            for c in ("nombre_es", "nombre_en", "fuente", "justificacion", "explicacion_es", "explicacion_en"):
                self.assertTrue(e[c].strip(), f"{e['id']}: falta {c}")

    def test_anuncios(self):
        import datetime as dt
        for a in self._csv("anuncios_electorales.csv"):
            self.assertLessEqual(dt.date.fromisoformat(a["fecha_anuncio"]), dt.date.fromisoformat(a["fecha_disolucion"]))
            self.assertTrue(a["fuente"].strip())


if __name__ == "__main__":
    unittest.main()
