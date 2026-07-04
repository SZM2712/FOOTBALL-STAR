// Base de datos de países del mundo para LEYENDA.
// tier: 1 (potencia mundial) a 6 (sin fútbol profesional real).
// nt: fuerza de la selección nacional (0-100).
// pop: población aproximada en millones (solo para ponderar el nacimiento).
// routes: rutas de emigración típicas hacia el fútbol europeo/de élite.

export function flagEmoji(code) {
  if (!code || code.length !== 2) return '🏳️';
  const A = 0x1f1e6;
  const chars = code.toUpperCase().split('').map((c) => A + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...chars);
}

const TIER_BIAS = { 1: 26, 2: 15, 3: 8, 4: 4, 5: 2, 6: 1 };

// [code, name, confed, tier, nt, pop, routes[]]
const RAW = [
  // ---- UEFA tier 1 ----
  ['FR', 'Francia', 'UEFA', 1, 95, 65, ['Directo a la elite: Francia -> Inglaterra/España']],
  ['ES', 'España', 'UEFA', 1, 93, 47, ['Cantera local hasta la elite propia']],
  ['DE', 'Alemania', 'UEFA', 1, 92, 84, ['Cantera Bundesliga, salida tardía si acaso']],
  ['EN', 'Inglaterra', 'UEFA', 1, 94, 56, ['Premier League desde la base']],
  ['IT', 'Italia', 'UEFA', 1, 90, 59, ['Serie A local, pocas salidas tempranas']],
  ['PT', 'Portugal', 'UEFA', 1, 89, 10, ['Cantera portuguesa, trampolín a España/Inglaterra']],
  ['NL', 'Países Bajos', 'UEFA', 1, 88, 17, ['Cantera Eredivisie, salto a Alemania/Inglaterra']],
  ['BE', 'Bélgica', 'UEFA', 1, 86, 12, ['Cantera belga, salto rápido a Francia/Países Bajos']],
  ['BR', 'Brasil', 'CONMEBOL', 1, 96, 216, ['Cantera brasileña -> Portugal/España directo']],
  ['AR', 'Argentina', 'CONMEBOL', 1, 95, 46, ['Cantera argentina -> España/Italia directo']],
  ['UY', 'Uruguay', 'CONMEBOL', 1, 85, 3.5, ['Cantera charrúa -> Europa vía España/Italia']],
  ['HR', 'Croacia', 'UEFA', 1, 84, 3.9, ['Cantera croata, salida joven a Alemania/Italia']],

  // ---- UEFA tier 2 ----
  ['CH', 'Suiza', 'UEFA', 2, 80, 8.7, ['Liga suiza como trampolín a Alemania']],
  ['DK', 'Dinamarca', 'UEFA', 2, 79, 5.8, ['Liga danesa -> Países Bajos/Alemania']],
  ['RS', 'Serbia', 'UEFA', 2, 78, 6.9, ['Cantera serbia, exportación temprana']],
  ['PL', 'Polonia', 'UEFA', 2, 76, 38, ['Liga polaca -> Alemania/Italia']],
  ['WA', 'Gales', 'UEFA', 2, 75, 3.1, ['Academias inglesas desde jóvenes']],
  ['XS', 'Escocia', 'UEFA', 2, 74, 5.5, ['Liga escocesa -> Inglaterra']],
  ['UA', 'Ucrania', 'UEFA', 2, 77, 41, ['Cantera ucraniana -> ligas de Europa del Este/Oeste']],
  ['AT', 'Austria', 'UEFA', 2, 76, 9, ['Bundesliga austriaca -> Alemania']],
  ['SE', 'Suecia', 'UEFA', 2, 77, 10.5, ['Allsvenskan -> Países Bajos/Alemania']],
  ['TR', 'Turquía', 'UEFA', 2, 78, 85, ['Süper Lig local, fuerte también en fichajes']],
  ['CO', 'Colombia', 'CONMEBOL', 2, 79, 52, ['Cantera cafetera -> Argentina/Portugal antes de Europa top']],
  ['CL', 'Chile', 'CONMEBOL', 2, 76, 19.5, ['Liga chilena -> Argentina/Brasil -> Europa']],
  ['MX', 'México', 'CONCACAF', 2, 75, 128, ['Liga MX fuerte, salto directo o vía MLS/España']],
  ['US', 'Estados Unidos', 'CONCACAF', 2, 74, 335, ['MLS -> préstamo a Europa (Países Bajos/Portugal)']],
  ['MA', 'Marruecos', 'CAF', 2, 78, 37, ['Doble nacionalidad frecuente, cantera franco-marroquí']],
  ['SN', 'Senegal', 'CAF', 2, 77, 17, ['Academias -> Francia/Bélgica']],
  ['NG', 'Nigeria', 'CAF', 2, 76, 223, ['Academias locales -> Bélgica/Portugal']],
  ['DZ', 'Argelia', 'CAF', 2, 75, 45, ['Doble nacionalidad franco-argelina común']],
  ['TN', 'Túnez', 'CAF', 2, 71, 12, ['Cantera -> Francia/Italia']],
  ['EG', 'Egipto', 'CAF', 2, 74, 112, ['Liga egipcia -> Europa vía agentes']],
  ['CI', "Costa de Marfil", 'CAF', 2, 74, 28, ['Academias -> Francia/Bélgica']],
  ['GH', 'Ghana', 'CAF', 2, 73, 33, ['Academias -> Alemania/Países Bajos']],
  ['CM', 'Camerún', 'CAF', 2, 73, 28, ['Academias -> Francia']],
  ['JP', 'Japón', 'AFC', 2, 78, 124, ['J-League -> Bundesliga/Bélgica']],
  ['KR', 'Corea del Sur', 'AFC', 2, 76, 51, ['K-League -> Bundesliga/Premier League']],
  ['IR', 'Irán', 'AFC', 2, 73, 88, ['Liga local -> Europa vía agentes']],
  ['SA', 'Arabia Saudita', 'AFC', 2, 71, 36, ['Liga saudí, poca emigración pero mucho poder económico']],
  ['QA', 'Catar', 'AFC', 2, 65, 2.9, ['Academias Aspire -> préstamos en España']],
  ['AU', 'Australia', 'AFC', 2, 70, 26, ['A-League -> Países Bajos/Escocia']],

  // ---- UEFA/otros tier 3 ----
  ['NO', 'Noruega', 'UEFA', 3, 74, 5.4, ['Eliteserien -> Países Bajos/Austria']],
  ['CZ', 'República Checa', 'UEFA', 3, 71, 10.7, ['Liga checa -> Alemania']],
  ['RO', 'Rumania', 'UEFA', 3, 68, 19, ['Liga rumana -> Turquía/Italia']],
  ['GR', 'Grecia', 'UEFA', 3, 67, 10.4, ['Liga griega, salida moderada']],
  ['RU', 'Rusia', 'UEFA', 3, 70, 144, ['Liga rusa, aislada por sanciones internacionales']],
  ['HU', 'Hungría', 'UEFA', 3, 64, 9.6, ['Liga húngara -> Alemania/Austria']],
  ['SK', 'Eslovaquia', 'UEFA', 3, 62, 5.4, ['Cantera -> República Checa/Alemania']],
  ['IS', 'Islandia', 'UEFA', 3, 60, 0.39, ['Academias amateurs -> Escandinavia -> Inglaterra']],
  ['IE', 'Irlanda', 'UEFA', 3, 63, 5.1, ['Academias inglesas desde adolescentes']],
  ['FI', 'Finlandia', 'UEFA', 3, 58, 5.6, ['Veikkausliiga -> Escandinavia/Alemania']],
  ['BG', 'Bulgaria', 'UEFA', 3, 57, 6.9, ['Liga búlgara -> Europa del Este']],
  ['EC', 'Ecuador', 'CONMEBOL', 3, 68, 18, ['Cantera -> México/Brasil -> Europa']],
  ['PY', 'Paraguay', 'CONMEBOL', 3, 62, 6.8, ['Cantera -> Argentina -> Europa']],
  ['VE', 'Venezuela', 'CONMEBOL', 3, 28, 28, ['Poca infraestructura, salida vía Colombia/Argentina']],
  ['BO', 'Bolivia', 'CONMEBOL', 3, 45, 12, ['Altura como ventaja local, poca exportación']],
  ['CR', 'Costa Rica', 'CONCACAF', 3, 63, 5.2, ['Liga local -> MLS/Liga MX -> Europa']],
  ['JM', 'Jamaica', 'CONCACAF', 3, 55, 2.8, ['Diáspora en Inglaterra facilita el salto']],
  ['PA', 'Panamá', 'CONCACAF', 3, 54, 4.4, ['Liga local -> MLS/Liga MX']],
  ['HN', 'Honduras', 'CONCACAF', 3, 50, 10.4, ['Liga local -> MLS/Liga MX']],
  ['CA', 'Canadá', 'CONCACAF', 3, 60, 39, ['MLS/academias -> Europa vía préstamos']],
  ['ZA', 'Sudáfrica', 'CAF', 3, 58, 60, ['PSL -> Bélgica/Países Bajos']],
  ['ML', 'Malí', 'CAF', 3, 62, 22, ['Academias -> Francia']],
  ['CD', 'RD Congo', 'CAF', 3, 56, 99, ['Academias -> Bélgica (lazo colonial)']],
  ['ZM', 'Zambia', 'CAF', 3, 48, 20, ['Liga local -> Sudáfrica -> Europa']],
  ['CV', 'Cabo Verde', 'CAF', 3, 45, 0.6, ['Doble nacionalidad con Portugal']],
  ['GN', 'Guinea', 'CAF', 3, 50, 14, ['Academias -> Francia']],
  ['BF', 'Burkina Faso', 'CAF', 3, 48, 22, ['Academias -> Francia/Turquía']],
  ['IQ', 'Irak', 'AFC', 3, 52, 43, ['Liga local, contexto complicado para exportar']],
  ['AE', 'Emiratos Árabes Unidos', 'AFC', 3, 50, 9.9, ['Liga rica, poca exportación']],
  ['UZ', 'Uzbekistán', 'AFC', 3, 53, 35, ['Liga local -> Rusia/Corea del Sur']],
  ['CN', 'China', 'AFC', 3, 48, 1412, ['Liga rica pero cerrada, poca exportación']],
  ['OM', 'Omán', 'AFC', 3, 42, 4.6, ['Liga local, poca exportación']],
  ['JO', 'Jordania', 'AFC', 3, 44, 11, ['Liga local -> Golfo Pérsico']],
  ['NZ', 'Nueva Zelanda', 'OFC', 3, 48, 5.2, ['A-League australiana como trampolín']],

  // ---- Tier 4 ----
  ['SI', 'Eslovenia', 'UEFA', 4, 55, 2.1, ['Cantera -> Austria/Alemania']],
  ['IL', 'Israel', 'UEFA', 4, 54, 9.4, ['Liga local -> Europa vía agentes']],
  ['BA', 'Bosnia y Herzegovina', 'UEFA', 4, 53, 3.3, ['Cantera -> Alemania/Austria']],
  ['MK', 'Macedonia del Norte', 'UEFA', 4, 48, 2.1, ['Cantera -> Serbia/Alemania']],
  ['AL', 'Albania', 'UEFA', 4, 47, 2.8, ['Diáspora facilita el salto a Italia']],
  ['GE', 'Georgia', 'UEFA', 4, 46, 3.7, ['Cantera -> Rusia/Turquía']],
  ['AM', 'Armenia', 'UEFA', 4, 42, 3, ['Liga local -> Rusia']],
  ['AZ', 'Azerbaiyán', 'UEFA', 4, 40, 10.2, ['Liga rica pero cerrada']],
  ['KZ', 'Kazajistán', 'UEFA', 4, 40, 19.6, ['Liga local -> Rusia']],
  ['CY', 'Chipre', 'UEFA', 4, 41, 1.2, ['Liga local, poca exportación']],
  ['LU', 'Luxemburgo', 'UEFA', 4, 35, 0.66, ['Academias belgas/francesas cercanas']],
  ['EE', 'Estonia', 'UEFA', 4, 38, 1.3, ['Liga local -> Escandinavia']],
  ['LV', 'Letonia', 'UEFA', 4, 37, 1.9, ['Liga local -> Rusia/Escandinavia']],
  ['LT', 'Lituania', 'UEFA', 4, 37, 2.8, ['Liga local -> Polonia/Alemania']],
  ['MD', 'Moldavia', 'UEFA', 4, 34, 2.5, ['Liga local -> Rumania/Rusia']],
  ['SV', 'El Salvador', 'CONCACAF', 4, 42, 6.3, ['Liga local -> MLS']],
  ['GT', 'Guatemala', 'CONCACAF', 4, 40, 17.8, ['Liga local -> México/MLS']],
  ['TT', 'Trinidad y Tobago', 'CONCACAF', 4, 44, 1.5, ['Diáspora en Inglaterra']],
  ['CW', 'Curazao', 'CONCACAF', 4, 40, 0.15, ['Lazo con Países Bajos facilita el salto']],
  ['HT', 'Haití', 'CONCACAF', 4, 38, 11.7, ['Diáspora en Francia/Canadá']],
  ['SR', 'Surinam', 'CONCACAF', 4, 38, 0.6, ['Lazo con Países Bajos facilita el salto']],
  ['UG', 'Uganda', 'CAF', 4, 40, 48, ['Liga local -> Sudáfrica']],
  ['KE', 'Kenia', 'CAF', 4, 39, 55, ['Liga local, poca exportación']],
  ['AO', 'Angola', 'CAF', 4, 42, 36, ['Lazo con Portugal facilita el salto']],
  ['MZ', 'Mozambique', 'CAF', 4, 38, 33, ['Lazo con Portugal facilita el salto']],
  ['GA', 'Gabón', 'CAF', 4, 43, 2.4, ['Academias -> Francia']],
  ['CG', 'Congo', 'CAF', 4, 39, 5.8, ['Academias -> Francia']],
  ['BJ', 'Benín', 'CAF', 4, 36, 13, ['Academias -> Francia']],
  ['ZW', 'Zimbabue', 'CAF', 4, 40, 16, ['Diáspora en Sudáfrica/Inglaterra']],
  ['TZ', 'Tanzania', 'CAF', 4, 36, 67, ['Liga local, poca exportación']],
  ['ET', 'Etiopía', 'CAF', 4, 33, 126, ['Liga local, poca exportación']],
  ['RW', 'Ruanda', 'CAF', 4, 34, 14, ['Liga local, poca exportación']],
  ['NA', 'Namibia', 'CAF', 4, 35, 2.6, ['Liga local -> Sudáfrica']],
  ['SD', 'Sudán', 'CAF', 4, 33, 48, ['Liga local, poca exportación']],
  ['LY', 'Libia', 'CAF', 4, 34, 6.9, ['Contexto inestable, poca exportación']],
  ['MR', 'Mauritania', 'CAF', 4, 32, 4.9, ['Academias -> Francia']],
  ['VN', 'Vietnam', 'AFC', 4, 40, 99, ['Liga local, poca exportación']],
  ['TH', 'Tailandia', 'AFC', 4, 42, 72, ['Liga local -> Japón/Europa raro']],
  ['IN', 'India', 'AFC', 4, 36, 1428, ['Liga local (ISL), poca exportación']],
  ['SY', 'Siria', 'AFC', 4, 38, 22, ['Contexto de guerra, diáspora en Europa']],
  ['LB', 'Líbano', 'AFC', 4, 34, 5.5, ['Diáspora facilita el salto']],
  ['KW', 'Kuwait', 'AFC', 4, 34, 4.3, ['Liga local, poca exportación']],
  ['KP', 'Corea del Norte', 'AFC', 4, 38, 26, ['Sistema estatal cerrado, casi sin exportación']],
  ['ID', 'Indonesia', 'AFC', 4, 38, 279, ['Liga local -> naturalizaciones desde Europa']],
  ['MY', 'Malasia', 'AFC', 4, 36, 34, ['Liga local, poca exportación']],
  ['PH', 'Filipinas', 'AFC', 4, 33, 117, ['Diáspora facilita naturalizaciones']],
  ['FJ', 'Fiyi', 'OFC', 4, 30, 0.9, ['Liga amateur, salida vía Nueva Zelanda']],
  ['PG', 'Papúa Nueva Guinea', 'OFC', 4, 25, 10, ['Fútbol minoritario frente al rugby league']],
  ['VU', 'Vanuatu', 'OFC', 4, 24, 0.33, ['Liga amateur']],
  ['SB', 'Islas Salomón', 'OFC', 4, 26, 0.74, ['Liga amateur']],

  // ---- Tier 5 ----
  ['MT', 'Malta', 'UEFA', 5, 30, 0.53, ['Liga local, casi sin exportación']],
  ['FO', 'Islas Feroe', 'UEFA', 5, 28, 0.05, ['Liga amateur, lazo con Dinamarca']],
  ['XK', 'Kosovo', 'UEFA', 5, 40, 1.8, ['Doble nacionalidad con Albania/Suiza']],
  ['GI', 'Gibraltar', 'UEFA', 5, 20, 0.034, ['Liga semi-amateur, lazo con Inglaterra']],
  ['NI', 'Nicaragua', 'CONCACAF', 5, 22, 6.9, ['Fútbol minoritario frente al béisbol']],
  ['CU', 'Cuba', 'CONCACAF', 5, 25, 11, ['Aislamiento, deserciones frecuentes']],
  ['DO', 'República Dominicana', 'CONCACAF', 5, 20, 11.3, ['Fútbol minoritario frente al béisbol']],
  ['GY', 'Guyana', 'CONCACAF', 5, 22, 0.8, ['Liga amateur']],
  ['BZ', 'Belice', 'CONCACAF', 5, 20, 0.4, ['Liga amateur']],
  ['BS', 'Bahamas', 'CONCACAF', 5, 15, 0.4, ['Fútbol casi inexistente']],
  ['BB', 'Barbados', 'CONCACAF', 5, 18, 0.28, ['Liga amateur']],
  ['MG', 'Madagascar', 'CAF', 5, 30, 30, ['Liga local -> Francia (lazo colonial)']],
  ['BW', 'Botsuana', 'CAF', 5, 28, 2.6, ['Liga local, poca exportación']],
  ['MW', 'Malaui', 'CAF', 5, 26, 20, ['Liga local, poca exportación']],
  ['NE', 'Níger', 'CAF', 5, 24, 27, ['Liga local, poca exportación']],
  ['TD', 'Chad', 'CAF', 5, 24, 18, ['Liga local, poca exportación']],
  ['GM', 'Gambia', 'CAF', 5, 30, 2.6, ['Academias -> Europa vía agentes informales']],
  ['SL', 'Sierra Leona', 'CAF', 5, 28, 8.4, ['Diáspora en Inglaterra']],
  ['LR', 'Liberia', 'CAF', 5, 30, 5.3, ['Legado de Weah, diáspora en EE.UU.']],
  ['TG', 'Togo', 'CAF', 5, 27, 8.6, ['Academias -> Francia']],
  ['SZ', 'Esuatini', 'CAF', 5, 20, 1.2, ['Fútbol minoritario']],
  ['LS', 'Lesoto', 'CAF', 5, 20, 2.3, ['Fútbol minoritario']],
  ['BI', 'Burundi', 'CAF', 5, 22, 13, ['Liga local, poca exportación']],
  ['DJ', 'Yibuti', 'CAF', 5, 15, 1.1, ['Fútbol casi inexistente']],
  ['SO', 'Somalia', 'CAF', 5, 12, 18, ['Contexto inestable']],
  ['ER', 'Eritrea', 'CAF', 5, 15, 3.7, ['Deserciones frecuentes en torneos']],
  ['SS', 'Sudán del Sur', 'CAF', 5, 14, 11, ['Fútbol emergente en contexto de conflicto']],
  ['GW', 'Guinea-Bisáu', 'CAF', 5, 26, 2.1, ['Lazo con Portugal facilita el salto']],
  ['GQ', 'Guinea Ecuatorial', 'CAF', 5, 24, 1.7, ['Naturalizaciones brasileñas frecuentes']],
  ['CF', 'República Centroafricana', 'CAF', 5, 16, 5.6, ['Contexto inestable']],
  ['KM', 'Comoras', 'CAF', 5, 22, 0.87, ['Diáspora en Francia']],
  ['MM', 'Myanmar', 'AFC', 5, 22, 54, ['Liga local, contexto político complicado']],
  ['KH', 'Camboya', 'AFC', 5, 20, 17, ['Liga local, poca exportación']],
  ['SG', 'Singapur', 'AFC', 5, 24, 6, ['Liga local rica pero cerrada']],
  ['YE', 'Yemen', 'AFC', 5, 15, 34, ['Contexto de guerra']],
  ['AF', 'Afganistán', 'AFC', 5, 12, 42, ['Contexto de guerra, diáspora escasa']],
  ['NP', 'Nepal', 'AFC', 5, 20, 30, ['Sin liga profesional real, fútbol minoritario']],
  ['BD', 'Bangladés', 'AFC', 5, 22, 173, ['Liga local, poca exportación']],
  ['MV', 'Maldivas', 'AFC', 5, 18, 0.52, ['Liga local, fútbol de playa popular']],
  ['MN', 'Mongolia', 'AFC', 5, 16, 3.4, ['Fútbol minoritario']],
  ['LA', 'Laos', 'AFC', 5, 16, 7.5, ['Liga local, poca exportación']],
  ['BT', 'Bután', 'AFC', 5, 12, 0.78, ['Fútbol minoritario, famoso partido "el peor del mundo"']],
  ['BN', 'Brunéi', 'AFC', 5, 14, 0.45, ['Liga local, poca exportación']],
  ['TL', 'Timor Oriental', 'AFC', 5, 14, 1.3, ['Fútbol emergente']],
  ['LK', 'Sri Lanka', 'AFC', 5, 18, 22, ['Fútbol minoritario frente al criquet']],
  ['PK', 'Pakistán', 'AFC', 5, 16, 240, ['Fútbol minoritario frente al criquet']],
  ['PF', 'Tahití', 'OFC', 5, 22, 0.28, ['Liga amateur, sorpresa histórica en Copa Confederaciones']],
  ['WS', 'Samoa', 'OFC', 5, 14, 0.22, ['Fútbol minoritario frente al rugby']],
  ['TO', 'Tonga', 'OFC', 5, 12, 0.1, ['Fútbol minoritario frente al rugby']],

  // ---- Tier 6: sin liga profesional real ----
  ['AD', 'Andorra', 'UEFA', 6, 15, 0.08, ['Liga amateur, jugadores emigran jóvenes a España']],
  ['SM', 'San Marino', 'UEFA', 6, 8, 0.034, ['Liga amateur, la más débil de Europa']],
  ['LI', 'Liechtenstein', 'UEFA', 6, 12, 0.04, ['Sin liga propia, clubes juegan en Suiza']],
  ['AS', 'Samoa Americana', 'OFC', 6, 8, 0.045, ['Fútbol casi inexistente, célebre por el 31-0']],
  ['CK', 'Islas Cook', 'OFC', 6, 10, 0.017, ['Fútbol amateur minoritario']],
  ['ST', 'Santo Tomé y Príncipe', 'CAF', 6, 14, 0.22, ['Fútbol minoritario, sin infraestructura']],
  ['SC', 'Seychelles', 'CAF', 6, 13, 0.1, ['Fútbol minoritario']],
  ['DM', 'Dominica', 'CONCACAF', 6, 12, 0.07, ['Fútbol minoritario']],
  ['GD', 'Granada', 'CONCACAF', 6, 14, 0.11, ['Fútbol minoritario']],
  ['AG', 'Antigua y Barbuda', 'CONCACAF', 6, 15, 0.1, ['Fútbol minoritario']],
  ['KN', 'San Cristóbal y Nieves', 'CONCACAF', 6, 12, 0.05, ['Fútbol minoritario']],
  ['LC', 'Santa Lucía', 'CONCACAF', 6, 12, 0.18, ['Fútbol minoritario']],
  ['VC', 'San Vicente y las Granadinas', 'CONCACAF', 6, 12, 0.11, ['Fútbol minoritario']],
];

export const COUNTRIES = RAW.map(([code, name, confed, tier, nt, pop, routes]) => {
  const weight = Math.pow(pop, 0.4) * TIER_BIAS[tier];
  return {
    code,
    name,
    confed,
    tier,
    nt,
    pop,
    routes,
    flag: flagEmoji({ EN: 'GB', WA: 'GB', XS: 'GB' }[code] ?? code),
    weight,
  };
});

export const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

export function pickBirthCountry(rng) {
  return rng.weighted(COUNTRIES, (c) => c.weight);
}

export const CONFED_NAMES = {
  UEFA: 'UEFA (Europa)',
  CONMEBOL: 'CONMEBOL (Sudamérica)',
  CONCACAF: 'CONCACAF (Norte/Centroamérica y Caribe)',
  CAF: 'CAF (África)',
  AFC: 'AFC (Asia)',
  OFC: 'OFC (Oceanía)',
};

/** Selecciones "grandes" de cada confederación, usadas para armar cuadros
 * de clasificación / torneos de forma plausible sin usar datos reales. */
export function topRivals(confed, excludeCode, n = 4) {
  return COUNTRIES.filter((c) => c.confed === confed && c.code !== excludeCode)
    .sort((a, b) => b.nt - a.nt)
    .slice(0, n);
}
