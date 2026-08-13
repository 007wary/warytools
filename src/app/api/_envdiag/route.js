import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    resend: Boolean(process.env.RESEND_API_KEY),
    token: Boolean(process.env.NEWSLETTER_TOKEN_SECRET),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    adminSecret: Boolean(process.env.NEWSLETTER_ADMIN_SECRET),
    adminPassword: Boolean(process.env.NEWSLETTER_ADMIN_PASSWORD),
  });
}
