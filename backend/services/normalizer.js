function softTrim(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Document-text labels (English + Hindi-OCR-equivalents) printed on Indian ID
// cards. PaddleOCR routinely picks these up alongside the actual field value
// because the YOLO bbox is generous. This is a documented vocabulary, not a
// guess at OCR garbage patterns — these phrases appear verbatim on every PAN /
// Aadhaar / Voter ID / DL / Passport.
//
// Each entry is matched case-insensitively. OCR substitution variants are
// allowed inline (e.g. "Date o[ftl] Birth" covers "Date of Birth" /
// "Date ot Birth" / "Date ol Birth", which all show up depending on font).
const DOCUMENT_LABELS = [
  /Permanent\s*Account\s*Number\s*Card/gi,
  /Income\s*Tax\s*Department/gi,
  /Govt\.?\s*of\s*India/gi,
  /Government\s*of\s*India/gi,
  /Election\s*Commission\s*of\s*India/gi,
  /Elector\s*Photo\s*Identity\s*Card/gi,
  /Identity\s*Card/gi,
  /Date\s*o[ftl]\s*Birth/gi,
  /Date\s*o[ftl]\s*Issue/gi,
  /Date\s*o[ftl]\s*Expiry/gi,
  /Place\s*o[ftl]\s*Birth/gi,
  /Place\s*o[ftl]\s*Issue/gi,
  /Year\s*o[ftl]\s*Birth/gi,
  /Blood\s*Group/gi,
  /Account\s*Number/gi,
  // Note: name-related labels (Father's Name, Husband's Name, etc.) are NOT
  // here — stripNameNoise() handles those via split-by-marker logic, which
  // preserves whichever side of the marker holds the value. Plain replace
  // would leave the discarded prefix ("fa/") behind.
];

function stripDocumentLabels(s) {
  let out = String(s);
  for (const m of DOCUMENT_LABELS) out = out.replace(m, " ");
  return out.replace(/\s+/g, " ").trim();
}

// Strip noise that often gets OCR'd alongside names: Hindi नाम/Name (often
// misread as "fqa T", "aTA", "T4", or other gibberish), "Father's Name" English
// label, "S/O" / "W/O" / "D/O" prefixes.
//
// Layout varies across card types — sometimes the label comes BEFORE the value
// ("Name: BK MADHUSUDAN") and sometimes AFTER ("BK MADHUSUDAN /Name" — a
// rotated PAN where the bbox captures the trailing Hindi नाम/Name label).
// Strategy: at each marker match, split the string and KEEP whichever side has
// more alphabetic characters — the value side has letters, the label side is
// just "Name" or punctuation.
function stripNameNoise(s) {
  let out = String(s);

  const markers = [
    /Father['’]?s\s*Name\s*[:\-]?\s*/gi,
    /Husband['’]?s\s*Name\s*[:\-]?\s*/gi,
    /Mother['’]?s\s*Name\s*[:\-]?\s*/gi,
    /Spouse['’]?s\s*Name\s*[:\-]?\s*/gi,
    /\/\s*Name\s*[:\-]?\s*/gi,
    // Garbage-prefix-glued-to-Name. Matches things like "aa7Name", "fooName"
    // (case-sensitive on "Name" so it doesn't fire on real names like
    // "Mahanama" — "name" lowercase, no match).
    /[A-Za-z0-9]*Name\b\s*/g,
    /\bS\s*\/\s*O\s*[:\-]?\s*/gi,
    /\bW\s*\/\s*O\s*[:\-]?\s*/gi,
    /\bD\s*\/\s*O\s*[:\-]?\s*/gi,
  ];

  const countAlpha = (str) => (str.match(/[A-Za-z]/g) || []).length;

  for (const marker of markers) {
    const matches = [...out.matchAll(marker)];
    if (matches.length === 0) continue;
    const last = matches[matches.length - 1];
    const before = out.slice(0, last.index);
    const after = out.slice(last.index + last[0].length);
    out = countAlpha(before) >= countAlpha(after) ? before : after;
  }

  return out.replace(/\s+/g, " ").trim();
}

function normalizeField(fieldKey, value) {
  if (value == null) return null;
  let v = String(value).trim();
  if (!v) return null;
  // Run the document-label stripper for *every* field — these phrases never
  // belong inside a value regardless of which one we're parsing.
  v = stripDocumentLabels(v);
  if (!v) return null;

  switch (fieldKey) {
    case "aadhaar_number": {
      // Extract first 12-digit run (allowing spaces between groups)
      const m = v.match(/\b(\d{4}\s?\d{4}\s?\d{4})\b/);
      if (m) {
        const digits = m[1].replace(/\D/g, "");
        return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
      }
      const digits = v.replace(/\D/g, "");
      if (digits.length === 12) {
        return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
      }
      return v;
    }
    case "pan_number": {
      // Pull the first PAN-shaped token (5 letters + 4 digits + 1 letter) out
      // of OCR noise. Fall back to a tolerant pattern that allows 1↔I, 0↔O —
      // common OCR confusions on phone-camera PAN photos — then convert those
      // digits back to letters in the appropriate positions.
      const upper = v.toUpperCase().replace(/\s+/g, "");
      const m = upper.match(/[A-Z]{5}\d{4}[A-Z]/);
      if (m) return m[0];
      const m2 = upper.match(/[A-Z01]{5}\d{4}[A-Z01]/);
      if (m2) {
        const fix = (s) => s.replace(/1/g, "I").replace(/0/g, "O");
        return fix(m2[0].slice(0, 5)) + m2[0].slice(5, 9) + fix(m2[0].slice(9, 10));
      }
      return upper;
    }
    case "dl_number": {
      const upper = v.toUpperCase();
      const m = upper.match(/[A-Z]{2}[\s\-]?\d{2}[\s\-]?\d{4}[\s\-]?\d{7}/);
      return m ? m[0].replace(/\s+/g, "") : upper.replace(/\s+/g, "");
    }
    case "passport_number": {
      const upper = v.toUpperCase().replace(/\s+/g, "");
      const m = upper.match(/[A-Z]\d{7}/);
      return m ? m[0] : upper;
    }
    case "voter_id_number": {
      const upper = v.toUpperCase().replace(/\s+/g, "");
      const m = upper.match(/[A-Z]{3}\d{7}/);
      return m ? m[0] : upper;
    }

    case "dob":
    case "date_of_issue":
    case "date_of_expiry": {
      // Prefer a separator-delimited date (DD/MM/YYYY etc.). Fall back to an
      // 8-digit run (DDMMYYYY) — OCR sometimes drops the slashes/dots when
      // they're thin or low contrast.
      const m = v.match(/(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/);
      if (m) return m[1];
      const m2 = v.match(/\b(\d{2})(\d{2})(\d{4})\b/);
      if (m2) return `${m2[1]}/${m2[2]}/${m2[3]}`;
      return v.replace(/\s+/g, " ").trim();
    }

    case "gender": {
      const upper = v.toUpperCase();
      if (/MALE/.test(upper)) return upper.includes("FEMALE") ? "FEMALE" : "MALE";
      if (/FEMALE/.test(upper)) return "FEMALE";
      if (/TRANSGENDER/.test(upper)) return "TRANSGENDER";
      if (/^M$/i.test(v.trim())) return "MALE";
      if (/^F$/i.test(v.trim())) return "FEMALE";
      return upper;
    }

    case "blood_group":
      return v.replace(/\s+/g, "").toUpperCase();

    case "full_name":
    case "father_name":
    case "husband_name":
    case "given_names":
    case "surname":
      return stripNameNoise(v);

    case "address":
    case "place_of_birth":
    case "place_of_issue":
      return v.replace(/\s+/g, " ").trim();

    default:
      return v;
  }
}

// Parse a passport's TD3-format MRZ. The MRZ is two lines of 44 chars each at
// the bottom of the data page, machine-readable and far more reliable than
// OCR'ing the visible text — particularly for names, where the visible "Name"
// bbox sometimes misses the second line.
//
// Line 1 layout: P<{COUNTRY:3}{SURNAME}<<{GIVEN_NAMES}<<<...
// Line 2 layout: {PASSPORT_NO:9}<{COUNTRY:3}{DOB:6}{CHK}{SEX}{EXP:6}{CHK}{PERSONAL_NO}<<
//
// We tolerate OCR slop: stray whitespace, '<' read as 'K' or 'C', leading
// garbage before "P<", numeric / letter swaps in passport_number positions.
function parseMrz(mrz1Raw, mrz2Raw) {
  const out = {};
  if (!mrz1Raw && !mrz2Raw) return out;

  const clean = (s) =>
    String(s || "").toUpperCase().replace(/[^A-Z0-9<]/g, "");

  // ---- Line 1: name ----
  if (mrz1Raw) {
    const line1 = clean(mrz1Raw);
    // Find "P<" (or close OCR variants K</C</< combined) and the 3-letter
    // country code right after; everything beyond is the name section.
    const m = line1.match(/P[<KC]?([A-Z]{3})(.+)/);
    if (m) {
      const namePart = m[2];
      const [surnameRaw, givenRaw = ""] = namePart.split("<<");
      const surname = surnameRaw.replace(/<+/g, " ").trim();
      const given = givenRaw.replace(/<+/g, " ").trim();
      if (surname) out.surname = surname;
      if (given) out.given_names = given;
      if (surname && given) out.full_name = `${given} ${surname}`;
      else if (surname) out.full_name = surname;
    }
  }

  // ---- Line 2: passport number, DOB, sex, expiry ----
  if (mrz2Raw) {
    const line2 = clean(mrz2Raw);
    if (line2.length >= 28) {
      const passportNum = line2.slice(0, 9).replace(/</g, "");
      const dobStr = line2.slice(13, 19);
      const sex = line2.charAt(20);
      const expStr = line2.slice(21, 27);

      if (/^[A-Z0-9]{6,9}$/.test(passportNum)) out.passport_number = passportNum;

      const yymmddToFull = (s) => {
        if (!/^\d{6}$/.test(s)) return null;
        const yy = parseInt(s.slice(0, 2), 10);
        const mm = s.slice(2, 4);
        const dd = s.slice(4, 6);
        // Two-digit year disambiguation per ICAO: cutover at 50.
        const yyyy = yy > 50 ? `19${s.slice(0, 2)}` : `20${s.slice(0, 2)}`;
        return `${dd}/${mm}/${yyyy}`;
      };
      const dob = yymmddToFull(dobStr);
      const exp = yymmddToFull(expStr);
      if (dob) out.dob = dob;
      if (exp) out.date_of_expiry = exp;
      if (sex === "M") out.gender = "MALE";
      else if (sex === "F") out.gender = "FEMALE";
    }
  }

  return out;
}

// Many Aadhaar / Voter ID detectors emit a single ADDRESS region that contains both
// "W/O: Spouse Name" or "S/O: Father Name" AND the postal address. Try to split them.
function extractRelativeFromAddress(addressValue) {
  if (!addressValue) return { address: addressValue, husband_name: null, father_name: null };
  let s = String(addressValue);
  let husband = null;
  let father = null;

  // Match "W/O: Name" or "W/O Name" up to a comma / "#" / digit / newline.
  const woMatch = s.match(/\b[Ww]\s*\/\s*[Oo]\s*:?\s*([A-Za-z][A-Za-z .]+?)(?=\s*[,#\n]|\s*\d|$)/);
  if (woMatch) {
    husband = woMatch[1].trim();
    s = s.replace(woMatch[0], "").trim().replace(/^[,\s]+/, "");
  }
  const soMatch = s.match(/\b[Ss]\s*\/\s*[Oo]\s*:?\s*([A-Za-z][A-Za-z .]+?)(?=\s*[,#\n]|\s*\d|$)/);
  if (soMatch) {
    father = soMatch[1].trim();
    s = s.replace(soMatch[0], "").trim().replace(/^[,\s]+/, "");
  }
  const doMatch = s.match(/\b[Dd]\s*\/\s*[Oo]\s*:?\s*([A-Za-z][A-Za-z .]+?)(?=\s*[,#\n]|\s*\d|$)/);
  if (doMatch && !father) {
    father = doMatch[1].trim();
    s = s.replace(doMatch[0], "").trim().replace(/^[,\s]+/, "");
  }

  return { address: s.replace(/\s+/g, " ").trim(), husband_name: husband, father_name: father };
}

function normalizeFields(rawFields) {
  const out = {};
  for (const [key, val] of Object.entries(rawFields || {})) {
    if (val == null) continue;
    if (typeof val === "object" && "value" in val) {
      out[key] = { ...val, value: normalizeField(key, val.value) };
    } else {
      out[key] = { value: normalizeField(key, val) };
    }
  }

  // MRZ post-processing: passports carry a machine-readable zone which is far
  // more reliable than the visible-text "Name" bbox (the latter routinely
  // misses the second line of given names on Indian passports). If the
  // detector picked up MRZ1/MRZ2, parse them and use the result as the
  // canonical source for surname / given_names / full_name. We still fall
  // back to the visible-text fields for missing pieces.
  const mrz1Value = out.mrz1?.value;
  const mrz2Value = out.mrz2?.value;
  if (mrz1Value || mrz2Value) {
    const mrz = parseMrz(mrz1Value, mrz2Value);
    for (const k of ["surname", "given_names", "full_name"]) {
      if (mrz[k]) out[k] = { value: mrz[k], derived_from: "mrz" };
    }
    for (const k of ["passport_number", "dob", "date_of_expiry", "gender"]) {
      if (mrz[k] && !out[k]?.value) out[k] = { value: mrz[k], derived_from: "mrz" };
    }
    // The MRZ rows themselves are an implementation detail — don't surface
    // them in the response.
    delete out.mrz1;
    delete out.mrz2;
  }

  // Address post-processing: pull W/O / S/O / D/O out into husband_name / father_name
  // when the underlying detector lumped them into address.
  if (out.address?.value) {
    const split = extractRelativeFromAddress(out.address.value);
    if (split.husband_name && !out.husband_name?.value) {
      out.husband_name = { value: split.husband_name, derived_from: "address" };
    }
    if (split.father_name && !out.father_name?.value) {
      out.father_name = { value: split.father_name, derived_from: "address" };
    }
    if (split.address && split.address !== out.address.value) {
      out.address = { ...out.address, value: split.address };
    }
  }

  return out;
}

module.exports = { normalizeField, normalizeFields, softTrim };
