import { NextResponse } from "next/server";

export async function GET() {
  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  const clientId = process.env.AUTH_KEYCLOAK_ID;
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://audax.3chan.kr";

  if (!issuer || !clientId) {
    return NextResponse.redirect(new URL("/auth/login", baseUrl));
  }

  const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.set("client_id", clientId);
  logoutUrl.searchParams.set(
    "post_logout_redirect_uri",
    `${baseUrl}/`
  );

  return NextResponse.redirect(logoutUrl.toString());
}
