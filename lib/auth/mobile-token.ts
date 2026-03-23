import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET);

export interface MobileTokenPayload {
  sub: string;
  email: string;
  name: string | null;
  iat: number;
}

export async function createMobileToken(user: {
  id: string;
  email: string;
  name: string | null;
}): Promise<string> {
  return new SignJWT({ sub: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyMobileToken(
  token: string
): Promise<MobileTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as MobileTokenPayload;
  } catch {
    return null;
  }
}
