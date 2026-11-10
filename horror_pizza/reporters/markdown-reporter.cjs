// Writes reports/test-report.md after every run: all tests, pass/fail, and failures (possible bugs).
const fs = require('node:fs');
const path = require('node:path');

const strip = (s = '') => s.replace(/\u001b\[[0-9;]*m/g, '');

class MarkdownReporter {
  constructor() {
    this.rows = [];
  }
  onBegin(config, suite) {
    this.started = new Date();
    this.root = config.rootDir;
  }
  onTestEnd(test, result) {
    const file = path.relative(this.root, test.location.file).replace(/\\/g, '/');
    const title = test.titlePath().slice(3).join(' > ');
    const outcome = test.outcome(); // expected | unexpected | flaky | skipped
    this.rows.push({
      file,
      title,
      outcome,
      ms: result.duration,
      error: strip(result.error?.message || '').split('\n').slice(0, 12).join('\n'),
    });
  }
  onEnd(result) {
    const count = (o) => this.rows.filter((r) => r.outcome === o).length;
    const failed = this.rows.filter((r) => r.outcome === 'unexpected' || r.outcome === 'flaky');
    const icon = { expected: 'PASS', unexpected: 'FAIL', flaky: 'FLAKY', skipped: 'SKIP' };
    const lines = [];
    lines.push('# Elm St Pizza - Test Report', '');
    lines.push(`Run started: ${this.started.toLocaleString()}  `);
    lines.push(`Overall status: **${result.status}**`, '');
    lines.push('## Summary', '');
    lines.push(`| Total | Passed | Failed | Flaky | Skipped |`, `|---:|---:|---:|---:|---:|`);
    lines.push(`| ${this.rows.length} | ${count('expected')} | ${count('unexpected')} | ${count('flaky')} | ${count('skipped')} |`, '');

    lines.push('## Failures and possible bugs', '');
    if (!failed.length) lines.push('No failures. No bugs were detected by these tests.', '');
    for (const r of failed) {
      lines.push(`### ${r.title}`, `File: \`${r.file}\``, '', '```', r.error || '(no message)', '```', '');
    }

    lines.push('## All tests', '', '| Result | File | Test | Time (ms) |', '|---|---|---|---:|');
    for (const r of this.rows) {
      lines.push(`| ${icon[r.outcome] || r.outcome} | ${r.file} | ${r.title.replace(/\|/g, '\\|')} | ${r.ms} |`);
    }
    lines.push('');

    const out = path.join(process.cwd(), 'reports', 'test-report.md');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, lines.join('\n'));
    console.log(`\nTest report written to ${out}`);
  }
}

module.exports = MarkdownReporter;
