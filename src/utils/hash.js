export async function sha256Hex(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(input));
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function derivePosCredentials(kod, emailDomain) {
  const hash = await sha256Hex(kod);
  return {
    email: `pos-${hash.slice(0, 16)}@${emailDomain}`,
    password: hash.slice(16, 64),
    kodHash: hash,
  };
}
