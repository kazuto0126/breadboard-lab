/**
 * 把網站版放到公開的 kazuto0126/breadboard-lab-site（GitHub Pages：https://kazuto0126.github.io/breadboard-lab-site/）。
 *
 * 原始碼 repo 是私人的，私人 repo 在免費方案不能用 Pages，所以另開一個公開 repo，只放 `npm run build` 建好的網頁檔
 * （學生打開網站時瀏覽器本來就會下載這些檔案）。commit 一律用 GitHub 的匿名信箱，不會公開作者的 Email。
 *
 * 用法：npm run publish:site（用目前 checkout 的程式碼建置；工作區要是乾淨的）
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE_REPO = 'https://github.com/kazuto0126/breadboard-lab-site.git';
const SITE_URL = 'https://kazuto0126.github.io/breadboard-lab-site/';
const AUTHOR = ['-c', 'user.name=kazuto0126', '-c', 'user.email=215132223+kazuto0126@users.noreply.github.com'];

const run = (cmd: string, args: string[], cwd?: string) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

if (run('git', ['status', '--porcelain'])) {
  console.error('工作區有還沒提交的修改，先 commit 再發布（網站要對應到一個 commit）。');
  process.exit(1);
}
const commit = run('git', ['rev-parse', '--short', 'HEAD']);

console.log(`建置 ${commit}…`);
execFileSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });

const work = mkdtempSync(join(tmpdir(), 'breadboard-lab-site-'));
try {
  run('git', ['clone', '--quiet', SITE_REPO, work]);
  for (const name of readdirSync(work)) if (name !== '.git') rmSync(join(work, name), { recursive: true, force: true });
  cpSync('dist', work, { recursive: true });
  // 不讓 GitHub Pages 用 Jekyll 處理（底線開頭的檔名會被略過）。
  writeFileSync(join(work, '.nojekyll'), '');
  writeFileSync(
    join(work, 'README.md'),
    `# Breadboard Lab（網頁版）\n\n網址：${SITE_URL}\n\n這個 repo 只放建好的網頁檔，由原始碼 repo 的 \`npm run publish:site\` 自動產生，請不要直接修改。\n`,
  );
  run('git', ['add', '--all'], work);
  if (!run('git', ['status', '--porcelain'], work)) {
    console.log('網站內容沒有變化，不需要發布。');
  } else {
    run('git', [...AUTHOR, 'commit', '--quiet', '-m', `Deploy breadboard-lab ${commit}`], work);
    run('git', ['push', '--quiet', 'origin', 'HEAD:main'], work);
    console.log(`已發布 ${commit}；GitHub Pages 大約一分鐘後更新：${SITE_URL}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
