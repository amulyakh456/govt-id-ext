const SCHEMAS = {
  aadhaar: {
    label: "Aadhaar Card",
    fields: [
      "full_name",
      "dob",
      "gender",
      "aadhaar_number",
      "address",
      "father_name",
      "husband_name",
    ],
    formats: {
      aadhaar_number: { regex: /^\d{4}\s?\d{4}\s?\d{4}$/, length: 12 },
      dob:            { regex: /^\d{2}[\/\-.]\d{2}[\/\-.]\d{4}$/ },
      gender:         { values: ["MALE", "FEMALE", "TRANSGENDER", "OTHER", "M", "F"] },
    },
    supported_by: ["c"],
  },
  pan: {
    label: "PAN Card",
    fields: ["full_name", "father_name", "dob", "pan_number"],
    formats: {
      pan_number: { regex: /^[A-Z]{5}\d{4}[A-Z]$/, length: 10 },
      dob:        { regex: /^\d{2}[\/\-.]\d{2}[\/\-.]\d{4}$/ },
    },
    supported_by: ["c"],
  },
  dl: {
    label: "Driving Licence",
    fields: [
      "full_name",
      "dob",
      "dl_number",
      "address",
      "date_of_issue",
      "date_of_expiry",
      "blood_group",
    ],
    formats: {
      dl_number:   { regex: /^[A-Z]{2}[\s\-]?\d{2}[\s\-]?\d{4}[\s\-]?\d{7}$/ },
      blood_group: { regex: /^(A|B|AB|O)[+\-]$/ },
      dob:         { regex: /^\d{2}[\/\-.]\d{2}[\/\-.]\d{4}$/ },
    },
    supported_by: ["c"],
  },
  passport: {
    label: "Passport",
    fields: [
      "full_name",
      "given_names",
      "surname",
      "dob",
      "place_of_birth",
      "gender",
      "passport_number",
      "date_of_issue",
      "date_of_expiry",
      "place_of_issue",
    ],
    formats: {
      passport_number: { regex: /^[A-Z]\d{7}$/ },
    },
    supported_by: ["c"],
  },
  voter_id: {
    label: "Voter ID Card",
    fields: ["full_name", "father_name", "dob", "gender", "voter_id_number", "address"],
    formats: {
      voter_id_number: { regex: /^[A-Z]{3}\d{7}$/ },
    },
    supported_by: ["c"],
  },
};

const MODEL_INFO = {
  c: {
    id: "c",
    name: "Unified pipeline (logasanjeev)",
    repo: "logasanjeev/indian-id-validator",
    repo_url: "https://huggingface.co/logasanjeev/indian-id-validator",
    architecture: "YOLO11 classifier + per-type detectors + PaddleOCR",
    supports: ["aadhaar", "pan", "dl", "passport", "voter_id"],
    detects: "varies by document type",
  },
};

module.exports = { SCHEMAS, MODEL_INFO };
