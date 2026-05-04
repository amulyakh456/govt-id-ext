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
