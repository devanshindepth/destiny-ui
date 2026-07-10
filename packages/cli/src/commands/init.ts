/**
 * `design-studio init` command
 *
 * Scaffolds design-studio.config.json and a starter set of Token_Files
 * (one per TokenCategory) in the target directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
import { TOKEN_CATEGORIES, type TokenCategory } from '@destiny-ui/core';

// ─── Default config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  tokensDir: './tokens',
  cssOutputDir: './dist/css',
  dtcgOutputDir: './dist/tokens',
  httpPort: 3300,
  wsPort: 3301,
  outputFormat: 'json',
  previewPath: null,
};

// ─── Starter token content per category ──────────────────────────────────────

/** Returns a minimal DTCG JSON object with one example token for the given category. */
function starterTokenFile(category: TokenCategory): Record<string, unknown> {
  switch (category) {
    case 'brand-colors':
      return {
        primary: {
          $type: 'color',
          $value: '#0066FFFF',
          $description: 'Primary brand color',
        },
      };

    case 'semantic-colors':
      return {
        background: {
          $type: 'color',
          $value: '#FFFFFFFF',
          $description: 'Default background color',
        },
      };

    case 'typography':
      return {
        'font-family-base': {
          $type: 'fontFamily',
          $value: 'Inter, sans-serif',
          $description: 'Base font family',
        },
        'font-size-base': {
          $type: 'fontSize',
          $value: '16px',
          $description: 'Base font size',
        },
        'font-weight-regular': {
          $type: 'fontWeight',
          $value: 400,
          $description: 'Regular font weight',
        },
        'line-height-base': {
          $type: 'lineHeight',
          $value: 1.5,
          $description: 'Base line height',
        },
        'letter-spacing-normal': {
          $type: 'letterSpacing',
          $value: '0px',
          $description: 'Normal letter spacing',
        },
      };

    case 'spacing':
      return {
        '4': {
          $type: 'dimension',
          $value: '16px',
          $description: 'Base spacing unit (1rem)',
        },
      };

    case 'border-radius':
      return {
        md: {
          $type: 'dimension',
          $value: '8px',
          $description: 'Medium border radius',
        },
      };

    case 'shadows':
      return {
        sm: {
          $type: 'shadow',
          $value: {
            offsetX: '0px',
            offsetY: '2px',
            blur: '4px',
            spread: '0px',
            color: '#00000026',
          },
          $description: 'Small shadow',
        },
      };

    case 'motion':
      return {
        'duration-fast': {
          $type: 'duration',
          $value: '150ms',
          $description: 'Fast animation duration',
        },
        'easing-standard': {
          $type: 'cubicBezier',
          $value: [0.4, 0, 0.2, 1],
          $description: 'Standard easing curve',
        },
      };

    case 'breakpoints':
      return {
        md: {
          $type: 'dimension',
          $value: '768px',
          $description: 'Medium breakpoint',
        },
      };

    default:
      return {};
  }
}

/** Maps each TokenCategory to its filename in the tokens/ directory. */
function categoryFilename(category: TokenCategory): string {
  return `${category}.json`;
}

// ─── Writability check ────────────────────────────────────────────────────────

function isDirectoryWritable(dirPath: string): boolean {
  try {
    // Try to access the directory. If it doesn't exist yet, check the parent.
    const target = fs.existsSync(dirPath) ? dirPath : path.dirname(dirPath);
    fs.accessSync(target, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// ─── Init command implementation ──────────────────────────────────────────────

export interface InitOptions {
  /** Target directory for scaffolding (defaults to cwd) */
  targetDir?: string;
  /** If true, skip interactive prompts (useful for programmatic use / testing) */
  yes?: boolean;
}

/**
 * Runs the init flow. Returns the exit code (0 on success, 1 on failure).
 * All user-visible output goes via the provided `out` / `err` write functions
 * so callers can capture it in tests.
 */
export async function runInit(
  options: InitOptions = {},
  out: (msg: string) => void = (m) => process.stdout.write(m + '\n'),
  err: (msg: string) => void = (m) => process.stderr.write(m + '\n'),
): Promise<number> {
  const targetDir = path.resolve(options.targetDir ?? process.cwd());

  // ── 1. Writability check ───────────────────────────────────────────────────
  if (!isDirectoryWritable(targetDir)) {
    err(
      `Error: target directory is not writable: ${targetDir}\n` +
      `Please check directory permissions and try again.`,
    );
    return 1;
  }

  const configPath = path.join(targetDir, 'design-studio.config.json');
  const tokensDir = path.join(targetDir, 'tokens');

  // ── 2. Prompt for overwrite if config already exists ──────────────────────
  const configExists = fs.existsSync(configPath);
  if (configExists && !options.yes) {
    const answers = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: 'confirm',
        name: 'proceed',
        message:
          `design-studio.config.json already exists in ${targetDir}. ` +
          `Overwrite it and the tokens/ directory?`,
        default: false,
      },
    ]);
    if (!answers.proceed) {
      out('Initialization cancelled.');
      return 0;
    }
  }

  // ── 3. Write config file ───────────────────────────────────────────────────
  const createdFiles: string[] = [];

  try {
    const configContent = JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n';
    fs.writeFileSync(configPath, configContent, 'utf8');
    createdFiles.push(configPath);
  } catch (writeErr) {
    err(
      `Error: failed to write config file: ${configPath}\n` +
      `${String(writeErr)}`,
    );
    return 1;
  }

  // ── 4. Create tokens/ directory ───────────────────────────────────────────
  try {
    fs.mkdirSync(tokensDir, { recursive: true });
  } catch (mkdirErr) {
    err(
      `Error: failed to create tokens directory: ${tokensDir}\n` +
      `${String(mkdirErr)}`,
    );
    return 1;
  }

  // ── 5. Write one starter Token_File per TokenCategory ─────────────────────
  for (const category of TOKEN_CATEGORIES) {
    const filename = categoryFilename(category);
    const filePath = path.join(tokensDir, filename);
    const content = JSON.stringify(starterTokenFile(category), null, 2) + '\n';

    try {
      fs.writeFileSync(filePath, content, 'utf8');
      createdFiles.push(filePath);
    } catch (writeErr) {
      err(
        `Error: failed to write token file: ${filePath}\n` +
        `${String(writeErr)}`,
      );
      return 1;
    }
  }

  // ── 6. Print all created file paths ───────────────────────────────────────
  out('Design Studio initialized successfully!\n');
  out('Created files:');
  for (const filePath of createdFiles) {
    out(`  ${filePath}`);
  }

  return 0;
}
