#!/usr/bin/env node
/**
 * design-studio CLI entry point.
 *
 * Commands:
 *   design-studio init   — scaffold config and starter token files
 *   design-studio dev    — start the development server
 */

import { Command } from 'commander';
import { runDev } from './commands/dev.js';

const program = new Command();

program
  .name('design-studio')
  .description('Local-first design token editor')
  .version('1.0.0');

program
  .command('dev')
  .description('Start the Design Studio development server')
  .action(() => {
    runDev().catch((err: unknown) => {
      console.error(
        '[design-studio] Unexpected error:',
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    });
  });

// `init` command is wired separately; import lazily to avoid loading
// inquirer until needed.
program
  .command('init')
  .description('Scaffold design-studio.config.json and starter token files')
  .action(async () => {
    const { runInit } = await import('./commands/init.js');
    runInit().catch((err: unknown) => {
      console.error(
        '[design-studio] Unexpected error:',
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    });
  });

program.parse(process.argv);
