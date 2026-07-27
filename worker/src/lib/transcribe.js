import OpenAI from 'openai';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Whisper limit 25MB -> split audio jadi chunk per 10 menit kalau perlu
export async function transcribeAudio(audioPath, outputDir) {
  const stats = fs.statSync(audioPath);
  const sizeMB = stats.size / (1024 * 1024);

  if (sizeMB <= 24) {
    return await transcribeChunk(audioPath, 0);
  }

  // split jadi chunk 10 menit
  const chunkPattern = `${outputDir}/chunk_%03d.mp3`;
  await execFileAsync('ffmpeg', [
    '-i', audioPath,
    '-f', 'segment',
    '-segment_time', '600',
    '-c', 'copy',
    '-y', chunkPattern
  ]);

  const chunkFiles = fs.readdirSync(outputDir)
    .filter(f => f.startsWith('chunk_'))
    .sort();

  let allSegments = [];
  let offset = 0;
  for (const file of chunkFiles) {
    const result = await transcribeChunk(`${outputDir}/${file}`, offset);
    allSegments = allSegments.concat(result.segments);
    offset += result.durationSeconds;
  }
  return { segments: allSegments };
}

async function transcribeChunk(filePath, timeOffset) {
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment', 'word']
  });

  const segments = (response.segments || []).map(s => ({
    start: s.start + timeOffset,
    end: s.end + timeOffset,
    text: s.text.trim()
  }));

  const lastEnd = segments.length ? segments[segments.length - 1].end : 0;
  return { segments, durationSeconds: lastEnd - timeOffset };
}
