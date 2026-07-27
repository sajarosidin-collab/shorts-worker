cat > worker/src/poll.js << 'EOF'
import { supabase } from './lib/supabase.js';
import { processJob } from './index.js';

async function pollOnce() {
  const { data: pendingJobs, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Gagal ambil job pending:', error.message);
    return;
  }

  if (!pendingJobs || pendingJobs.length === 0) {
    console.log('Tidak ada job pending.');
    return;
  }

  console.log(`Ditemukan ${pendingJobs.length} job pending. Memproses satu-satu...`);
  for (const job of pendingJobs) {
    await processJob(job.id);
  }
  console.log('Semua job pending selesai diproses.');
}

pollOnce().then(() => process.exit(0));
EOF
