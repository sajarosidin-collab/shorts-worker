import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

async function transcribeChunk(filePath, timeOffset) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });

  const form = new FormData();
  form.append('file', blob, 'audio.mp3');
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: form
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error: ${response.status} ${errText}`);
  }

  const data = await response.json();

  const segments = (data.segments || []).map(s => ({
    start: s.start + timeOffset,
    end: s.end + timeOffset,
    text: s.text.trim()
  }));

  const lastEnd = segments.length ? segments[segments.length - 1].end : 0;
  return { segments, durationSeconds: lastEnd - timeOffset };
}

export async function transcribeAudio(audioPath, outputDir) {
  const stats = fs.statSync(audioPath);
  const sizeMB = stats.size / (1024 * 1024);

  if (sizeMB <= 24) {
    return await transcribeChunk(audioPath, 0);
  }

  const dir = outputDir || audioPath.substring(0, audioPath.lastIndexOf('/'));
  const chunkPattern = `${dir}/chunk_%03d.mp3`;
  await execFileAsync('ffmpeg', [
    '-i', audioPath,
    '-f', 'segment',
    '-segment_time', '600',
    '-c', 'copy',
    '-y', chunkPattern
  ]);

  const chunkFiles = fs.readdirSync(dir)
    .filter(f => f.startsWith('chunk_'))
    .sort();

  let allSegments = [];
  let offset = 0;
  for (const file of chunkFiles) {
    const result = await transcribeChunk(`${dir}/${file}`, offset);
    allSegments = allSegments.concat(result.segments);
    offset += result.durationSeconds;
  }
  return { segments: allSegments };
}
