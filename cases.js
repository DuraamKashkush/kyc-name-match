/*
 * cases.js — synthetic sample cases.
 *
 * ALL DATA HERE IS INVENTED. These are not real people, real documents or real
 * addresses. Document numbers are constructed to exercise the validation rules
 * (the Israeli ID numbers below carry arithmetically valid check digits so the
 * ID-CHK rule has something real to verify) and correspond to no issued document.
 *
 * Each case exists to make one behaviour visible in about forty seconds:
 *
 *   clean          the baseline — what a straightforward match looks like
 *   translit       the headline — Arabic document vs Latin system record, which
 *                  naive string comparison scores near zero and this engine matches
 *   dobswap        a data-entry error (07/03 vs 03/07) told apart from a real
 *                  date-of-birth discrepancy
 *   crossdoc       one person, two different documents — the ordinary case, and
 *                  the one the other five hid by carrying the same document
 *                  number on both sides
 *   different      two records that look similar and are not the same person —
 *                  the false positive the engine has to refuse to make
 */

const RECORD_FIELDS = [
  'fullName',
  'dob',
  'sex',
  'docType',
  'docNumber',
  'expiry',
  'country',
  'address',
  'mrz',
];

/* Only M and F are compared by the engine; the blank is a real option, not a
 * placeholder, because a record that does not state a sex asserts nothing. */
const SEX_OPTIONS = [
  { value: '', label: 'Unspecified' },
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
];

/* The MRZ strings below were generated with valid ICAO Doc 9303 check digits so
 * the verification rules have real arithmetic to run. They belong to no issued
 * document. Only the identity documents carry one — a system record is keyed by
 * a person and has no machine-readable zone, which is the whole reason the two
 * halves are worth comparing. */

const DOC_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
  { value: 'residence_permit', label: 'Residence permit' },
  { value: 'drivers_license', label: "Driver's licence" },
];

const COUNTRIES = [
  { value: 'IL', label: 'Israel' },
  { value: 'JO', label: 'Jordan' },
  { value: 'PS', label: 'Palestinian Authority' },
  { value: 'EG', label: 'Egypt' },
  { value: 'LB', label: 'Lebanon' },
  { value: 'SY', label: 'Syria' },
  { value: 'IQ', label: 'Iraq' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'MA', label: 'Morocco' },
  { value: 'TN', label: 'Tunisia' },
  { value: 'DZ', label: 'Algeria' },
  { value: 'OTHER', label: 'Other' },
];

const SAMPLE_CASES = {
  clean: {
    label: 'Clean match',
    blurb:
      'Both records agree — the baseline.',
    a: {
      fullName: 'Mohammad Ahmad Al-Sayed',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: "12 Ha'Atzmaut St, Haifa",
      mrz: 'I<ISR3102567891<<<<<<<<<<<<<<<\n9403073M3105146ISR<<<<<<<<<<<6\nALSAYED<<MOHAMMAD<AHMAD<<<<<<<',
    },
    b: {
      fullName: 'Mohammad Ahmad Al-Sayed',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: '12 Haatzmaut Street, Haifa',
    },
  },

  translit: {
    label: 'Transliteration',
    blurb:
      'Arabic passport vs a Latin record — same person, near-zero string match.',
    a: {
      fullName: 'محمد أحمد السيد',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'passport',
      docNumber: 'M1234567',
      expiry: '2029-08-22',
      country: 'JO',
      address: 'عمان، الأردن',
      mrz: 'P<JORELSAYED<<MOHAMMAD<AHMAD<<<<<<<<<<<<<<<<\nM1234567<0JOR9403073M2908225<<<<<<<<<<<<<<06',
    },
    b: {
      fullName: 'Muhammed Elsayed',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'passport',
      docNumber: 'M1234567',
      expiry: '2029-08-22',
      country: 'JO',
      address: 'Amman, Jordan',
    },
  },

  dobswap: {
    label: 'Day/month swap',
    blurb:
      'Names agree; the dates are day and month swapped — a keying error.',
    a: {
      fullName: 'מוחמד אחמד אלסייד',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: 'אום אל-פחם',
      mrz: 'I<ISR3102567891<<<<<<<<<<<<<<<\n9403073M3105146ISR<<<<<<<<<<<6\nALSAYED<<MOHAMMAD<AHMAD<<<<<<<',
    },
    b: {
      fullName: 'Mohammad Ahmad Al-Sayed',
      dob: '1994-07-03',
      sex: 'M',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: 'Umm al-Fahm',
    },
  },

  arabhebrew: {
    label: 'Arabic vs Hebrew',
    blurb:
      'Arabic ID vs a Hebrew record — no Latin involved.',
    a: {
      fullName: 'محمد أحمد السيد',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: 'أم الفحم',
      mrz: '',
    },
    b: {
      fullName: 'מוחמד אחמד אלסייד',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: 'אום אל-פחם',
    },
  },

  crossdoc: {
    label: 'Passport vs ID',
    blurb:
      'One person, two documents — different numbers, not held against the match.',
    a: {
      fullName: 'محمد أحمد السيد',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'passport',
      docNumber: 'M1234567',
      expiry: '2029-08-22',
      country: 'IL',
      address: 'أم الفحم',
      mrz: 'P<ISRALSAYED<<MOHAMMAD<AHMAD<<<<<<<<<<<<<<<<\nM1234567<0ISR9403073M2908225<<<<<<<<<<<<<<06',
    },
    b: {
      fullName: 'Mohammad Ahmad Al-Sayed',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: 'Umm al-Fahm',
    },
  },

  siblings: {
    label: 'Brother vs sister',
    blurb:
      'Samir vs Samira — one name skeleton, separated by sex.',
    a: {
      fullName: 'Samir Hassan',
      dob: '1996-09-12',
      sex: 'M',
      docType: 'national_id',
      docNumber: '204938278',
      expiry: '2030-04-18',
      country: 'IL',
      address: 'Nazareth',
    },
    b: {
      fullName: 'Samira Hassan',
      dob: '1996-09-12',
      sex: 'F',
      docType: 'passport',
      docNumber: 'M8842317',
      expiry: '2029-11-02',
      country: 'IL',
      address: 'Nazareth',
    },
  },

  different: {
    label: 'Different person',
    blurb:
      'Similar name, different person — and on an expired document.',
    a: {
      fullName: 'Mohammad Ahmad Al-Sayed',
      dob: '1994-03-07',
      sex: 'M',
      docType: 'passport',
      docNumber: 'M1234567',
      expiry: '2029-08-22',
      country: 'JO',
      address: 'Amman, Jordan',
      mrz: 'P<JORALSAYED<<MOHAMMAD<AHMAD<<<<<<<<<<<<<<<<\nM1234567<0JOR9403073M2908225<<<<<<<<<<<<<<06',
    },
    b: {
      fullName: 'Mahmoud Ahmad Al-Sharif',
      dob: '1991-11-22',
      sex: 'M',
      docType: 'passport',
      docNumber: 'K7781234',
      expiry: '2024-02-10',
      country: 'JO',
      address: 'Irbid, Jordan',
    },
  },
};

const EMPTY_RECORD = {
  fullName: '',
  dob: '',
  sex: '',
  docType: 'passport',
  docNumber: '',
  expiry: '',
  country: 'IL',
  address: '',
  mrz: '',
};
