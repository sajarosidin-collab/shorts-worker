import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function findHighlights(transcriptSegments, videoDurationSeconds, maxClips = 5) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const transcriptText = transcriptSegments
    .map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join('\n');

  const prompt = `Kamu adalah editor konten short-form video (YouTube Shorts/TikTok) untuk niche bola/podcast berbahasa Indonesia.

Berikut transcript lengkap video (durasi total ${videoDurationSeconds} detik) dengan timestamp:
${transcriptText}

Tugas: pilih maksimal ${maxClips} segmen paling menarik untuk dijadikan short video terpisah (durasi 30-60 detik masing-masing, TIDAK overlap satu sama lain).
Kriteria: momen emosional, statement kontroversial/menarik, insight kuat, punchline, atau momen viral-potential.

Balas HANYA dalam format JSON array, tanpa markdown, tanpa penjelasan tambahan:
[
  {
    "start": <detik mulai, number>,
    "end": <detik selesai, number>,
    "title": "<judul pendek menarik max 60 karakter, gaya clickbait ringan>",
    "caption": "<caption untuk post, 1-2 kalimat + relevant hashtag>"
  }
]`;

  const result = await model.generateContent(prompt);
  let text = result.response.text().trim();
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');

  const clips = JSON.parse(text);

  return clips.filter(c =>
    c.end > c.start &&
    (c.end - c.start) >= 15 &&
    (c.end - c.start) <= 90 &&
    c.end <= videoDurationSeconds
  );
}
