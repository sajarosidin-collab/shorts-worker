import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execFileAsync = promisify(execFile);

export async function downloadVideo(youtubeUrl, outputDir) {
  const outputPath = `${outputDir}/source.mp4`;

  await execFileAsync('yt-dlp', [
    '--extractor-args', 'youtube:player_client=android,web',
    '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', outputPath,
    youtubeUrl
  ], { maxBuffer: 1024 * 1024 * 50 });

  if (!fs.existsSync(outputPath)) {
    throw new Error('Download gagal: file tidak ditemukan setelah yt-dlp selesai');
  }

  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    outputPath
  ]);

  const { stdout: titleOut } = await execFileAsync('yt-dlp', [
    '--print', '%(title)s',
    '--skip-download',
    youtubeUrl
  ]);

  return {
    filePath: outputPath,
    durationSeconds: Math.round(parseFloat(stdout.trim())),
    title: titleOut.trim()
  };
}

export async function extractAudio(videoPath, outputDir) {
  const audioPath = `${outputDir}/audio.mp3`;
  await execFileAsync('ffmpeg', [
    '-i', videoPath,
    '-vn',
    '-b:a', '64k',
    '-y', audioPath
  ]);
  return audioPath;
}
