import axios from "axios";

// In dev, requests to "/api" are proxied to the local backend by Vite. In a
// production build, set VITE_API_URL to the deployed backend's origin (e.g.
// https://my-backend.onrender.com) — Axios will then send requests to
// `${VITE_API_URL}/api/...`.
const baseURL = (import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "") + "/api";
const client = axios.create({ baseURL, timeout: 240000 });

export async function getHealth() {
  const res = await client.get("/health");
  return res.data;
}

export async function extractDocument({ file, model, type }) {
  const fd = new FormData();
  fd.append("document", file);
  fd.append("model", model);
  fd.append("type", type);
  const res = await client.post("/extract", fd);
  return res.data;
}
