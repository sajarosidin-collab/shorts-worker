import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execFileAsync = promisify(execFile);

// Format waktu detik -> SRT timestamp (00:00:00,000)
function toSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

// Bikin file .srt dari segmen transcript yang jatuh di range clip
export function buildSrt(transcriptSegments, clipStart, clipEnd) {
  const relevant = transcriptSegments.filter(
    s => s.end > clipStart && s.start < clipEnd
  );

  let srt = '';
  relevant.forEach((seg, i) => {
    const start = Math.max(0, seg.start - clipStart);
    const end = Math.min(clipEnd - clipStart, seg.end - clipStart);
    srt += `${i + 1}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${seg.text}\n\n`;
  });

  return srt;
}

// Potong video jadi 1 clip (format vertikal 9:16, crop tengah)
export async function cutClip(sourcePath, outputPath, start, end) {
  const duration = end - start;
  await execFileAsync('ffmpeg', [
    '-i', sourcePath,
    '-ss', String(start),
    '-t', String(duration),
    '-vf', "crop=ih*9/16:ih,scale=1080:1920",
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-y', outputPath
  ], { maxBuffer: 1024 * 1024 * 50 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`cutClip gagal: ${outputPath} tidak terbentuk`);
  }
}

// Burn subtitle ke video (hardcode ke video, biar langsung siap post)
export async function burnSubtitle(videoPath, srtPath, outputPath) {
  await execFileAsync('ffmpeg', [
    '-i', videoPath,
    '-vf', `subtitles=${srtPath}:force_style='FontName=Arial,FontSize=14,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3,Outline=2,Alignment=2,MarginV=80'`,
    '-c:a', 'copy',
    '-y', outputPath
  ], { maxBuffer: 1024 * 1024 * 50 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`burnSubtitle gagal: ${outputPath} tidak terbentuk`);
  }
}
