import { MAX_BACKUP_SIZE } from "./backup"

export const WEBDAV_CONFIG_KEY = "webdav-config"
export interface WebDavConfig { url: string; username: string; password: string }
export interface WebDavRemote { exists: boolean; etag: string | null; text: string }
export type WebDavErrorCode = "url" | "username" | "permission" | "network" | "timeout" | "auth" | "conflict" | "http" | "noEtag" | "tooLarge" | "missing"

export class WebDavError extends Error {
  constructor(public code: WebDavErrorCode, public status?: number) { super(code) }
}

export function validateWebDavConfig(input: WebDavConfig): WebDavConfig {
  let url: URL
  try { url = new URL(input.url.trim()) } catch { throw new WebDavError("url") }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || url.pathname.endsWith("/")) {
    throw new WebDavError("url")
  }
  if (input.username.includes(":")) throw new WebDavError("username")
  return { url: url.href, username: input.username, password: input.password }
}

export function loadWebDavConfig(storage: Storage = localStorage): WebDavConfig {
  try {
    const data = JSON.parse(storage.getItem(WEBDAV_CONFIG_KEY) || "{}")
    return {
      url: typeof data.url === "string" ? data.url : "",
      username: typeof data.username === "string" ? data.username : "",
      password: typeof data.password === "string" ? data.password : ""
    }
  } catch { return { url: "", username: "", password: "" } }
}

export function webDavPermission(config: WebDavConfig) {
  const url = new URL(config.url)
  // Match patterns use hostnames without ports; permissions.request runs in the click handler.
  return { origins: [`${url.protocol}//${url.hostname}/*`] }
}

export function basicAuthorization(config: WebDavConfig) {
  const bytes = new TextEncoder().encode(`${config.username}:${config.password}`)
  return `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""))}`
}

async function request(config: WebDavConfig, method: "GET" | "PUT", headers: Record<string, string> = {}, body?: string, timeoutMs = 20000): Promise<WebDavRemote> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(config.url, {
      method,
      headers: {
        ...(config.username || config.password ? { Authorization: basicAuthorization(config) } : {}),
        ...headers
      },
      body,
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
      redirect: "error"
    })
    if (response.status === 404 && method === "GET") return { exists: false, etag: null, text: "" }
    if (response.status === 401 || response.status === 403) throw new WebDavError("auth", response.status)
    if (response.status === 412) throw new WebDavError("conflict", response.status)
    if (!response.ok) throw new WebDavError("http", response.status)
    if (Number(response.headers.get("Content-Length")) > MAX_BACKUP_SIZE) throw new WebDavError("tooLarge")
    let text = ""
    if (method === "GET" && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let size = 0
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > MAX_BACKUP_SIZE) {
          controller.abort()
          throw new WebDavError("tooLarge")
        }
        text += decoder.decode(chunk.value, { stream: true })
      }
      text += decoder.decode()
    }
    return { exists: true, etag: response.headers.get("ETag"), text }
  } catch (error) {
    if (error instanceof WebDavError) throw error
    throw new WebDavError(controller.signal.aborted ? "timeout" : "network")
  } finally { clearTimeout(timeout) }
}

export function readWebDav(config: WebDavConfig, timeoutMs?: number) {
  return request(validateWebDavConfig(config), "GET", {}, undefined, timeoutMs)
}

export function writeWebDav(config: WebDavConfig, text: string, remote: WebDavRemote, timeoutMs?: number) {
  if (new Blob([text]).size > MAX_BACKUP_SIZE) throw new WebDavError("tooLarge")
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" }
  if (remote.exists) {
    // Weak/missing ETags cannot safely protect an overwrite against concurrent clients.
    if (!remote.etag || !/^"[^"\r\n]*"$/.test(remote.etag)) throw new WebDavError("noEtag")
    headers["If-Match"] = remote.etag
  } else headers["If-None-Match"] = "*"
  return request(validateWebDavConfig(config), "PUT", headers, text, timeoutMs)
}
