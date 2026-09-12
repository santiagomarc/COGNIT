import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'node:fs';

// Load .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([^=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[match[1].trim()] = val;
  }
}

const apiKey = envVars.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY not found in .env.local');
  process.exit(1);
}

const genai = new GoogleGenerativeAI(apiKey);

const models = [
  { name: 'gemini-2.5-flash (Old Default)', id: 'gemini-2.5-flash' },
  { name: 'gemini-3.5-flash-lite (New Default)', id: 'gemini-3.5-flash-lite' },
];

const sampleNotes = `
Photosynthesis is a biological process used by plants, algae, and certain bacteria to convert light energy into chemical energy.
In oxygenic photosynthesis, light energy transfers electrons from water (H2O) to carbon dioxide (CO2), producing carbohydrates.
In this process, water is oxidized, meaning it loses electrons, while the carbon dioxide is reduced, meaning it gains electrons.
This results in the release of oxygen (O2) into the atmosphere. The overall chemical equation is: 6CO2 + 6H2O + light -> C6H12O6 + 6O2.
The light-dependent reactions take place on the thylakoid membranes inside chloroplasts, whereas the Calvin cycle occurs in the stroma.
`;

const benchmarkTasks = [
  {
    name: 'Task 1: Structured JSON Flashcard Extraction',
    isJson: true,
    prompt: `Analyze the study text and extract 3 flashcards. Return JSON matching: {"cards": [{"question": string, "answer": string, "explanation": string}]}. Notes: ${sampleNotes}`,
  },
  {
    name: 'Task 2: Study Hint Generation (Text)',
    isJson: false,
    prompt: `A student is reviewing a flashcard with Question: "Where does the Calvin cycle take place in a plant cell?" Provide a subtle, one-sentence hint without giving the answer directly.`,
  },
  {
    name: 'Task 3: Creative Mnemonic Generation',
    isJson: false,
    prompt: `Create a memorable, concise mnemonic to help a student remember the overall chemical equation of photosynthesis: 6CO2 + 6H2O + light -> C6H12O6 + 6O2.`,
  }
];

async function runBenchmark() {
  console.log('='.repeat(72));
  console.log('   DIRECT MODEL TEST & EFFICIENCY BENCHMARK');
  console.log('   Comparing: gemini-2.5-flash vs. gemini-3.5-flash-lite');
  console.log('='.repeat(72));

  const results = {};

  for (const m of models) {
    results[m.id] = { name: m.name, tasks: [] };
    console.log(`\n▶ Testing ${m.name} [model: "${m.id}"]...`);

    for (const task of benchmarkTasks) {
      process.stdout.write(`  • ${task.name}... `);
      const model = genai.getGenerativeModel({
        model: m.id,
        generationConfig: {
          temperature: task.isJson ? 0.1 : 0.4,
          maxOutputTokens: 1024,
          ...(task.isJson ? { responseMimeType: 'application/json' } : {}),
        },
      });

      const startTime = performance.now();
      try {
        const response = await model.generateContent(task.prompt);
        const endTime = performance.now();
        const durationMs = Math.round(endTime - startTime);
        const text = response.response.text();
        const usage = response.response.usageMetadata || {};

        let validJson = true;
        if (task.isJson) {
          try {
            JSON.parse(text);
          } catch {
            validJson = false;
          }
        }

        const taskResult = {
          taskName: task.name,
          success: true,
          durationMs,
          promptTokens: usage.promptTokenCount ?? 0,
          candidatesTokens: usage.candidatesTokenCount ?? 0,
          totalTokens: usage.totalTokenCount ?? 0,
          tokensPerSec: usage.candidatesTokenCount
            ? Math.round((usage.candidatesTokenCount / (durationMs / 1000)) * 10) / 10
            : null,
          validJson: task.isJson ? validJson : undefined,
          sampleOutput: text.trim().slice(0, 160).replace(/\n/g, ' ') + '...',
        };

        results[m.id].tasks.push(taskResult);
        console.log(`OK (${durationMs}ms | ${taskResult.candidatesTokens} output tokens | ${taskResult.tokensPerSec ?? 'N/A'} tok/s)`);
      } catch (err) {
        console.log(`FAILED! Error: ${err.message}`);
        results[m.id].tasks.push({
          taskName: task.name,
          success: false,
          error: err.message,
        });
      }
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log('   DETAILED COMPARISON & RESULTS');
  console.log('='.repeat(72));

  for (let i = 0; i < benchmarkTasks.length; i++) {
    const taskName = benchmarkTasks[i].name;
    console.log(`\n[${taskName}]`);
    const r25 = results['gemini-2.5-flash'].tasks[i];
    const r35 = results['gemini-3.5-flash-lite'].tasks[i];

    console.log(`  gemini-2.5-flash:      ${r25.durationMs}ms | ${r25.candidatesTokens} tokens | Speed: ${r25.tokensPerSec} tok/s | JSON valid: ${r25.validJson ?? 'N/A'}`);
    console.log(`  gemini-3.5-flash-lite: ${r35.durationMs}ms | ${r35.candidatesTokens} tokens | Speed: ${r35.tokensPerSec} tok/s | JSON valid: ${r35.validJson ?? 'N/A'}`);
    if (r25.durationMs && r35.durationMs) {
      const speedup = Math.round(((r25.durationMs - r35.durationMs) / r25.durationMs) * 100);
      const diffWord = speedup >= 0 ? `${speedup}% faster` : `${Math.abs(speedup)}% slower`;
      console.log(`  ==> 3.5 Flash-Lite is ${diffWord} (Time saved: ${r25.durationMs - r35.durationMs}ms)`);
    }
    console.log(`  Output sample (3.5 Flash-Lite): "${r35.sampleOutput}"`);
  }
}

runBenchmark().catch(console.error);
