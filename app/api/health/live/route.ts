export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
} as const;

export async function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'dairtak-web',
      release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    },
    { headers: NO_STORE_HEADERS },
  );
}
