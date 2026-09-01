import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
console.log('Key prefix:', apiKey?.slice(0, 12) + '...');

const genai = new GoogleGenerativeAI(apiKey);

// Test 1: Can we list models? (lightest possible API call)
console.log('\n--- Test 1: List models ---');
try {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  const data = await resp.json();
  if (data.error) {
    console.error('ERROR:', data.error.code, data.error.status);
    console.error('Message:', data.error.message);
  } else {
    const flashModels = data.models?.filter(m => m.name.includes('flash')) ?? [];
    console.log('OK — Found', data.models?.length, 'models.');
    console.log('Flash models:', flashModels.map(m => m.name).join(', '));
  }
} catch (e) {
  console.error('Fetch error:', e.message);
}

// Test 2: Try the simplest possible generation
console.log('\n--- Test 2: Minimal generation ---');
try {
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent('Say hello in one word.');
  console.log('OK —', result.response.text());
} catch (e) {
  console.error('ERROR:', e.constructor?.name);
  // Parse out the key details
  const msg = e.message || '';
  if (msg.includes('limit:')) {
    const limits = msg.match(/limit: \d+/g);
    console.error('Limits found:', limits);
  }
  if (msg.includes('403')) {
    console.error('>>> 403 = API not enabled or key restrictions.');
    console.error('>>> Fix: Go to https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com');
    console.error('>>>       and click ENABLE for the project this key belongs to.');
  }
  if (msg.includes('429') && msg.includes('limit: 0')) {
    console.error('>>> limit: 0 means the API is NOT enabled on this project.');
    console.error('>>> This is NOT a rate limit — the quota was never provisioned.');
  }
  if (msg.includes('400')) {
    console.error('>>> 400 = Bad request — likely invalid API key format.');
  }
  // Print full error for diagnosis
  console.error('\nFull message (first 500 chars):');
  console.error(msg.slice(0, 500));
}
