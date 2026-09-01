import { expect, test } from "bun:test";
import { formatDay, localizeHeader, textsToTranslate } from "./format";
import type { DayMenu } from "./matkant";

test("localizeHeader translates Danish dates", () => {
  expect(localizeHeader("Mandag den 24. august")).toBe("Lunedì 24 agosto");
  expect(localizeHeader("Søndag den 1. december")).toBe("Domenica 1 dicembre");
  expect(localizeHeader("Uge 35, 2026")).toBe("Settimana 35, 2026");
  expect(localizeHeader("24.08.2026 til 28.08.2026")).toBe(
    "24.08.2026 – 28.08.2026",
  );
});

const day: DayMenu = {
  header: "Mandag den 24. august",
  menu: [
    {
      id: 1,
      name: "Rødvinssauce",
      contains_da: "Spor af okse, Hestekød",
      contains_en: "",
      category: "meat",
      ui_class: "ui-meat",
      price: "6",
    },
  ],
  open: 1,
  has_menu: 1,
  opens_at: "08:00",
  closes_at: "15:30",
  note: "",
  closed_text: "",
  no_menu_text: "",
  weight_price: "7.50",
  weight_price_text: "",
};

test("textsToTranslate sends the API only dishes and unknown allergens", () => {
  // "Okse" is in the local table, "Hestekød" is not.
  expect(textsToTranslate([day])).toEqual(["Rødvinssauce", "Hestekød"]);
});

test("formatDay uses translation, allergen table, and Danish original", () => {
  const out = formatDay(
    day,
    new Map([
      ["Rødvinssauce", "Salsa al vino rosso"],
      ["Hestekød", "Carne di cavallo"],
    ]),
    "Oggi",
    "it",
  );
  expect(out).toContain("<b>Oggi</b> — Lunedì 24 agosto");
  expect(out).toContain("Salsa al vino rosso <i>(Rødvinssauce)</i>");
  expect(out).toContain("(+6 kr.)");
  expect(out).toContain("contiene: tracce di manzo, carne di cavallo");
});

test("without translation available it stays in Danish", () => {
  const out = formatDay(day, new Map());
  expect(out).toContain("🍖 Rødvinssauce");
  expect(out).not.toContain("undefined");
});
