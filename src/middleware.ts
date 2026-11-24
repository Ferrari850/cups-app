import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/manifest.webmanifest", "/icon", "/apple-icon"];
// Paths that never need a login check, so the middleware skips the auth call for them entirely.
const STATIC_PATHS = ["/manifest.webmanifest", "/icon", "/apple-icon"];

export async function middleware(request: NextRequest) {
  if (STATIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Verifies the login token (locally when Supabase signing keys are on) and refreshes it when it expires.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub;

  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
