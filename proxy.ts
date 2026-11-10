import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE !== "true") {
    if (request.nextUrl.pathname === "/maintenance") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";

  return NextResponse.rewrite(url, {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
