const help = `mh - local model harness

Implementation is in progress.

Usage:
  mh help
  mh --help
  mh -h
`;

const [command] = process.argv.slice(2);
const helpCommands = new Set([undefined, 'help', '--help', '-h']);

if (helpCommands.has(command)) {
  process.stdout.write(help);
  process.exitCode = 0;
} else {
  process.stderr.write(`mh: command not implemented yet: ${command}\n`);
  process.stderr.write('Run mh help for available scaffold help.\n');
  process.exitCode = 1;
}
