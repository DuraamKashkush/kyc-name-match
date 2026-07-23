/*
 * lists/sample.js — SYNTHETIC watchlist, for the public demo and the tests.
 *
 * EVERY ENTRY HERE IS INVENTED. These are not real sanctioned persons, not real
 * PEPs, and correspond to no real list. The public site screens against this
 * fictional list; the real build replaces it with lists/live/*.json produced by
 * tools/load-lists.js from OFAC / UN / OpenSanctions / FATF (see SOURCES.md).
 *
 * Entry shape:
 *   { id, source, type ('sanction'|'pep'), program, name, aliases[],
 *     dob?, sex?, nationality? }   — dob/sex/nationality may be absent, which is
 *   the norm on real lists and is exactly why a name hit cannot always be
 *   discounted on secondary identifiers.
 */

var SAMPLE_WATCHLIST = [
  // — Sanctions, richly aliased (the transliteration cases screening exists for) —
  { id: 'SYN-001', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-A',
    name: 'محمد عبدالله الفارسي',
    aliases: ['Mohammad Abdullah Al-Farsi', 'Muhammad Abdallah Elfarisi', 'מוחמד עבדאללה אלפארסי'],
    dob: '1975-06-20', sex: 'M', nationality: 'SY' },
  { id: 'SYN-002', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-A',
    name: 'إبراهيم يوسف الحاج',
    aliases: ['Ibrahim Yousef Al-Hajj', 'Ibraheem Yusuf Elhaj'],
    dob: '1982-11-03', sex: 'M', nationality: 'IQ' },
  { id: 'SYN-003', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-B',
    name: 'خالد سمير الديب',
    aliases: ['Khaled Samir Al-Deeb', 'Khalid Sameer Eldib'],
    dob: '1969-02-14', sex: 'M', nationality: 'LB' },
  // No DOB on the entry — a name hit here cannot be discounted on date of birth.
  { id: 'SYN-004', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-B',
    name: 'أحمد ناصر القاسم',
    aliases: ['Ahmad Nasser Al-Qasim', 'Ahmed Naser Elqasem'],
    sex: 'M', nationality: 'SY' },
  { id: 'SYN-005', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-A',
    name: 'فاطمة علي المصري',
    aliases: ['Fatima Ali Al-Masri', 'Fatimah Aly Elmasry'],
    dob: '1988-07-09', sex: 'F', nationality: 'EG' },
  { id: 'SYN-006', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-C',
    name: 'يوسف مروان الشامي',
    aliases: ['Yousef Marwan Al-Shami', 'Yusuf Marwan Elshamy'],
    dob: '1991-04-27', sex: 'M', nationality: 'SY' },
  { id: 'SYN-007', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-C',
    name: 'زياد فؤاد الترك',
    aliases: ['Ziad Fouad Al-Turk', 'Ziyad Fuad Elturk'],
    dob: '1978-09-30', sex: 'M', nationality: 'LB' },
  { id: 'SYN-008', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-A',
    name: 'رامي عادل الحسيني',
    aliases: ['Rami Adel Al-Husseini', 'Ramy Adil Elhusseini'],
    dob: '1985-12-12', sex: 'M', nationality: 'JO' },
  { id: 'SYN-009', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-B',
    name: 'سعاد حسن البخاري',
    aliases: ['Souad Hassan Al-Bukhari', 'Suad Hasan Elbukhari'],
    dob: '1972-03-18', sex: 'F', nationality: 'IQ' },
  { id: 'SYN-010', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-C',
    name: 'طارق منير العلي',
    aliases: ['Tarek Munir Al-Ali', 'Tariq Muneer Elali'],
    dob: '1980-08-08', sex: 'M', nationality: 'SA' },

  // — PEPs (heightened due diligence, not a block) —
  { id: 'SYN-101', source: 'Synthetic PEP Register', type: 'pep', program: 'Minister (fictional)',
    name: 'عبدالرحمن كمال الوزير',
    aliases: ['Abdulrahman Kamal Al-Wazir', 'Abd al-Rahman Kamal Elwazir'],
    dob: '1963-05-05', sex: 'M', nationality: 'JO' },
  { id: 'SYN-102', source: 'Synthetic PEP Register', type: 'pep', program: 'Legislator (fictional)',
    name: 'ليلى عبدالله النائب',
    aliases: ['Layla Abdullah Al-Naib', 'Leila Abdallah Elnaib'],
    dob: '1970-10-22', sex: 'F', nationality: 'LB' },
  { id: 'SYN-103', source: 'Synthetic PEP Register', type: 'pep', program: 'Official (fictional)',
    name: 'Daniel Roberts',
    aliases: ['Dan Roberts'],
    dob: '1968-01-15', sex: 'M', nationality: 'GB' },

  // — Latin/Hebrew filler so blocking has something to sift —
  { id: 'SYN-201', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-D',
    name: 'Victor Petrov', aliases: ['Viktor Petrov'], dob: '1974-06-01', sex: 'M', nationality: 'RU' },
  { id: 'SYN-202', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-D',
    name: 'Elena Sokolova', aliases: ['Yelena Sokolova'], dob: '1983-02-11', sex: 'F', nationality: 'RU' },
  { id: 'SYN-203', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-D',
    name: 'משה בן־דוד', aliases: ['Moshe Ben-David', 'Moshe Bendavid'], dob: '1965-09-19', sex: 'M', nationality: 'IL' },
  { id: 'SYN-204', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-E',
    name: 'حسين قاسم البدوي', aliases: ['Hussein Qasim Al-Badawi'], dob: '1979-07-07', sex: 'M', nationality: 'IQ' },
  { id: 'SYN-205', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-E',
    name: 'نور الدين عباس', aliases: ['Nour Al-Din Abbas', 'Nureddin Abbas'], dob: '1990-11-11', sex: 'M', nationality: 'SY' },
  { id: 'SYN-206', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-E',
    name: 'سامي وليد الخوري', aliases: ['Sami Walid Al-Khoury'], dob: '1986-03-03', sex: 'M', nationality: 'LB' },
  { id: 'SYN-207', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-F',
    name: 'ماجد أنور الشريف', aliases: ['Majed Anwar Al-Sharif', 'Majid Anwar Elsharif'], dob: '1977-05-25', sex: 'M', nationality: 'JO' },
  { id: 'SYN-208', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-F',
    name: 'هالة سمير القرشي', aliases: ['Hala Samir Al-Qurashi'], dob: '1984-04-14', sex: 'F', nationality: 'SA' },
  { id: 'SYN-209', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-F',
    name: 'وليد جمال الأسمر', aliases: ['Walid Jamal Al-Asmar', 'Waleed Gamal Elasmar'], dob: '1981-01-29', sex: 'M', nationality: 'EG' },
  { id: 'SYN-210', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-F',
    name: 'رانيا فادي الحلبي', aliases: ['Rania Fadi Al-Halabi'], dob: '1993-08-17', sex: 'F', nationality: 'SY' },
  // A distinct alias (a nom de guerre) that does not resemble the primary — so a
  // query matching it is an alias-only hit and lights up SCR-5.
  { id: 'SYN-211', source: 'Synthetic Sanctions List', type: 'sanction', program: 'SYN-G',
    name: 'Boris Volkov', aliases: ['Karim Shadid', 'كريم شديد'],
    dob: '1976-10-10', sex: 'M', nationality: 'RU' },
];

/* SYNTHETIC country-risk table — invented levels for the demo. The real build
 * replaces this from FATF / EU / Basel (see SOURCES.md). */
var SAMPLE_COUNTRY_RISK = {
  SY: { level: 'high',   sources: ['FATF (illustrative)'] },
  IQ: { level: 'high',   sources: ['FATF (illustrative)'] },
  IR: { level: 'high',   sources: ['FATF (illustrative)'] },
  LB: { level: 'medium', sources: ['EU high-risk (illustrative)'] },
  RU: { level: 'medium', sources: ['EU (illustrative)'] },
  EG: { level: 'medium', sources: ['Basel AML Index (illustrative)'] },
  JO: { level: 'low',    sources: [] },
  SA: { level: 'low',    sources: [] },
  IL: { level: 'low',    sources: [] },
  GB: { level: 'low',    sources: [] },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SAMPLE_WATCHLIST: SAMPLE_WATCHLIST, SAMPLE_COUNTRY_RISK: SAMPLE_COUNTRY_RISK };
}
