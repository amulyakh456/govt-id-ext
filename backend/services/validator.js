function validateField(fieldKey, value, schema) {
  if (value == null || value === "") {
    return { valid: false, reason: "missing" };
  }
  const format = schema?.formats?.[fieldKey];
  if (!format) return { valid: true, reason: "no_format_defined" };

  if (format.regex && !format.regex.test(value)) {
    return { valid: false, reason: "format_mismatch", expected: format.regex.toString() };
  }
  if (format.length && value.replace(/\s/g, "").length !== format.length) {
    return { valid: false, reason: "length_mismatch", expected: format.length };
  }
  if (format.values && !format.values.includes(value)) {
    return { valid: false, reason: "value_not_in_allowed_set" };
  }
  return { valid: true };
}

function applyValidation(fields, schema) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (v == null) continue;
    const value = typeof v === "object" && "value" in v ? v.value : v;
    const validation = validateField(k, value, schema);
    out[k] = {
      value,
      confidence: typeof v === "object" ? v.confidence : undefined,
      valid: validation.valid,
      validation_reason: validation.valid ? undefined : validation.reason,
    };
  }
  return out;
}

module.exports = { validateField, applyValidation };
