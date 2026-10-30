/** Small hand-written samples in the exact shape of the Tatoeba exports. */
export const ENG_DETAILED = [
  "10\teng\tI usually have breakfast at seven.\talice_u\t2010-01-01 00:00:00\t2011-01-01 00:00:00",
  "11\teng\tTom is cooking dinner.\tbob_u\t2010-01-01 00:00:00\t\\N",
  "12\teng\tIt's raining again.\t\\N\t\\N\t\\N",
  "13\teng\tWe ate rice and vegetables for lunch.\tcarol_u\t2012-02-02 00:00:00\t\\N",
  "14\teng\tI bought 3 apples.\tcarol_u\t2012-02-02 00:00:00\t\\N",
  "15\teng\tIt's cold and windy today.\tdave_u\t2013-03-03 00:00:00\t\\N",
  "16 eng broken row without tabs",
  "17\teng\tWe visited London last summer.\tdave_u\t2013-03-03 00:00:00\t\\N",
].join("\n");

export const SPA_DETAILED = [
  "20\tspa\tNormalmente desayuno a las siete.\tesp_a\t2010-01-01 00:00:00\t\\N",
  "21\tspa\tTom está cocinando la cena.\tesp_b\t2010-01-01 00:00:00\t\\N",
  "22\tspa\tEstá lloviendo otra vez.\tesp_c\t2010-01-01 00:00:00\t\\N",
  "23\tspa\tComimos arroz y verduras en el almuerzo.\t\\N\t\\N\t\\N",
  "24\tspa\tAlmorzamos arroz y verduras.\tesp_d\t2010-01-01 00:00:00\t\\N",
  "25\tspa\tCompré 3 manzanas.\tesp_d\t2010-01-01 00:00:00\t\\N",
  "26\tspa\tHoy hace frío y viento.\tesp_e\t2010-01-01 00:00:00\t\\N",
].join("\n");

/** Both directions, plus a duplicate and a link to a missing sentence. */
export const LINKS = [
  "10\t20",
  "20\t10",
  "11\t21",
  "12\t22",
  "13\t23",
  "24\t13",
  "14\t25",
  "15\t26",
  "15\t26",
  "15\t999",
].join("\n");
