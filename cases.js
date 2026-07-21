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
 *   different      two records that look similar and are not the same person —
 *                  the false positive the engine has to refuse to make
 */

const RECORD_FIELDS = [
  'fullName',
  'dob',
  'docType',
  'docNumber',
  'expiry',
  'country',
  'address',
];

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
      'Both records agree. The baseline — this is what the engine looks like when nothing is wrong.',
    a: {
      fullName: 'Mohammad Ahmad Al-Sayed',
      dob: '1994-03-07',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: "12 Ha'Atzmaut St, Haifa",
    },
    b: {
      fullName: 'Mohammad Ahmad Al-Sayed',
      dob: '1994-03-07',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: '12 Haatzmaut Street, Haifa',
    },
  },

  translit: {
    label: 'Transliteration mismatch',
    blurb:
      'Arabic passport against a Latin-script system record. Different spelling, different article, patronymic dropped — same person. Naive comparison scores this near zero.',
    a: {
      fullName: 'محمد أحمد السيد',
      dob: '1994-03-07',
      docType: 'passport',
      docNumber: 'M1234567',
      expiry: '2029-08-22',
      country: 'JO',
      address: 'عمان، الأردن',
    },
    b: {
      fullName: 'Muhammed Elsayed',
      dob: '1994-03-07',
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
      'Hebrew-script ID against a Latin system record. The names agree; the dates are the same two numbers in the other order — a keying error, not a different person.',
    a: {
      fullName: 'מוחמד אחמד אלסייד',
      dob: '1994-03-07',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: 'אום אל-פחם',
    },
    b: {
      fullName: 'Mohammad Ahmad Al-Sayed',
      dob: '1994-07-03',
      docType: 'national_id',
      docNumber: '310256789',
      expiry: '2031-05-14',
      country: 'IL',
      address: 'Umm al-Fahm',
    },
  },

  different: {
    label: 'Different person, similar name',
    blurb:
      'Shared patronymic and a given name that collapses to the same consonants. Not the same person — and the system record is on an expired document.',
    a: {
      fullName: 'Mohammad Ahmad Al-Sayed',
      dob: '1994-03-07',
      docType: 'passport',
      docNumber: 'M1234567',
      expiry: '2029-08-22',
      country: 'JO',
      address: 'Amman, Jordan',
    },
    b: {
      fullName: 'Mahmoud Ahmad Al-Sharif',
      dob: '1991-11-22',
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
  docType: 'passport',
  docNumber: '',
  expiry: '',
  country: 'IL',
  address: '',
};
