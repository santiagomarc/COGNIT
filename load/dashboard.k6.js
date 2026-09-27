// load/dashboard.k6.js — k6 run -e BASE_URL=… -e SESSION_COOKIE="$(node --env-file=.env.local scripts/k6-session.mjs)" -e DECK_ID=… load/dashboard.k6.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 25 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{page:dashboard}': ['p(95)<800'],
    'http_req_duration{page:deck}': ['p(95)<900'],
    'http_req_duration{page:stats}': ['p(95)<900'],
  },
};

const headers = {
  Cookie: __ENV.SESSION_COOKIE,
  // Vercel preview protection, if enabled on the project.
  ...(__ENV.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': __ENV.VERCEL_BYPASS } : {}),
};

export default function browse() {
  const get = (path, page) => http.get(`${__ENV.BASE_URL}${path}`, { headers, tags: { page }, redirects: 0 });
  check(get('/dashboard', 'dashboard'), { 'dashboard 200': (res) => res.status === 200 });
  check(get(`/dashboard/${__ENV.DECK_ID}`, 'deck'), { 'deck 200': (res) => res.status === 200 });
  check(get('/dashboard/stats', 'stats'), { 'stats 200': (res) => res.status === 200 });
  sleep(1);
}
