// IP del cliente para el rate limit. Cloudflare setea CF-Connecting-IP y el cliente
// no puede falsearlo. La IP NUNCA se guarda en crudo: se guarda HMAC-SHA256(pepper, bucket).
// IPv6 se agrupa por /64 (un dispositivo rota direcciones dentro de su /64).

export function bucketDeIp(ip: string): string {
  const limpia = ip.trim().toLowerCase();
  // IPv4-mapeada (::ffff:1.2.3.4) -> IPv4
  const mapeada = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(limpia);
  if (mapeada) return mapeada[1]!;
  if (!limpia.includes(":")) return limpia; // IPv4 (o basura: se hashea igual)

  const [cabeza, cola, ...resto] = limpia.split("::");
  if (resto.length > 0) return limpia; // inválida: se hashea tal cual
  const g = (s: string | undefined) => (s ? s.split(":").filter((x) => x.length > 0) : []);
  const a = g(cabeza);
  const b = g(cola);
  const ceros = limpia.includes("::") ? Math.max(0, 8 - a.length - b.length) : 0;
  const grupos = limpia.includes("::") ? [...a, ...Array<string>(ceros).fill("0"), ...b] : a;
  if (grupos.length !== 8) return limpia;
  return grupos.slice(0, 4).map((x) => x.padStart(4, "0")).join(":") + "::/64";
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hashIp(bucket: string, pepper: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(bucket)));
}
