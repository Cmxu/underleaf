#!/usr/bin/env node

const { Server } = require('/usr/lib/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js');
const { StdioServerTransport } = require('/usr/lib/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('/usr/lib/node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class LaTeXCompileServer {
  constructor() {
    this.server = new Server(
      {
        name: 'latex-compile-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'compile_latex',
          description: 'Compile a LaTeX document with specified engine and options',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the main .tex file to compile'
              },
              engine: {
                type: 'string',
                enum: ['pdflatex', 'xelatex', 'lualatex', 'latex'],
                default: 'pdflatex',
                description: 'LaTeX engine to use for compilation'
              },
              output_dir: {
                type: 'string',
                default: 'build',
                description: 'Output directory for compiled files'
              },
              compile_twice: {
                type: 'boolean',
                default: false,
                description: 'Run compilation twice (useful for references, TOC, etc.)'
              },
              verbose: {
                type: 'boolean',
                default: false,
                description: 'Enable verbose output'
              }
            },
            required: ['file_path']
          }
        },
        {
          name: 'check_latex_syntax',
          description: 'Check LaTeX file for syntax errors without full compilation',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the .tex file to check'
              }
            },
            required: ['file_path']
          }
        },
        {
          name: 'get_latex_log',
          description: 'Retrieve and parse the LaTeX compilation log for errors and warnings',
          inputSchema: {
            type: 'object',
            properties: {
              log_path: {
                type: 'string',
                description: 'Path to the .log file (optional, will auto-detect)'
              },
              file_path: {
                type: 'string',
                description: 'Path to the .tex file (to auto-detect log file)'
              }
            }
          }
        },
        {
          name: 'clean_latex_build',
          description: 'Clean LaTeX auxiliary files (.aux, .log, .out, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              target_dir: {
                type: 'string',
                default: '.',
                description: 'Directory to clean (default: current directory)'
              },
              aggressive: {
                type: 'boolean',
                default: false,
                description: 'Also remove .pdf files'
              }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'compile_latex':
            return await this.handleCompileLatex(args);
          case 'check_latex_syntax':
            return await this.handleCheckSyntax(args);
          case 'get_latex_log':
            return await this.handleGetLog(args);
          case 'clean_latex_build':
            return await this.handleCleanBuild(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async handleCompileLatex(args) {
    const {
      file_path,
      engine = 'pdflatex',
      output_dir = 'build',
      compile_twice = false,
      verbose = false
    } = args;

    // Validate inputs
    if (!file_path) {
      throw new Error('file_path is required');
    }

    if (!fs.existsSync(file_path)) {
      throw new Error(`File not found: ${file_path}`);
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(output_dir)) {
      fs.mkdirSync(output_dir, { recursive: true });
    }

    const results = [];
    const compilationRuns = compile_twice ? 2 : 1;

    try {
      for (let run = 1; run <= compilationRuns; run++) {
        console.log(`[LaTeX Compile] Run ${run}/${compilationRuns} with ${engine}`);
        
        const command = this.buildCompileCommand(engine, file_path, output_dir, verbose);
        console.log(`[LaTeX Compile] Command: ${command}`);

        const result = await this.executeCommand(command);
        results.push({
          run,
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          command
        });

        // If first run failed and we're doing multiple runs, don't continue
        if (!result.success && run === 1 && compile_twice) {
          break;
        }
      }

      // Check for output PDF
      const expectedPdf = path.join(output_dir, path.basename(file_path, '.tex') + '.pdf');
      const pdfExists = fs.existsSync(expectedPdf);

      // Parse log file for errors and warnings
      const logPath = path.join(output_dir, path.basename(file_path, '.tex') + '.log');
      let logAnalysis = null;
      if (fs.existsSync(logPath)) {
        logAnalysis = this.parseLogFile(logPath);
      }

      const finalResult = results[results.length - 1];
      const overallSuccess = finalResult.success && pdfExists;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: overallSuccess,
              engine,
              runs: compilationRuns,
              pdf_generated: pdfExists,
              pdf_path: pdfExists ? expectedPdf : null,
              results,
              log_analysis: logAnalysis,
              summary: this.generateCompilationSummary(overallSuccess, results, logAnalysis)
            }, null, 2)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
              engine,
              file_path
            }, null, 2)
          }
        ]
      };
    }
  }

  async handleCheckSyntax(args) {
    const { file_path } = args;

    if (!file_path || !fs.existsSync(file_path)) {
      throw new Error(`File not found: ${file_path}`);
    }

    try {
      // Use lacheck if available, otherwise do basic syntax check
      let command = `lacheck "${file_path}"`;
      
      // Check if lacheck is available
      try {
        execSync('which lacheck', { stdio: 'ignore' });
      } catch {
        // Fallback to chktex if available
        try {
          execSync('which chktex', { stdio: 'ignore' });
          command = `chktex -q "${file_path}"`;
        } catch {
          // Basic syntax check by trying to parse with LaTeX
          command = `pdflatex -interaction=nonstopmode -halt-on-error -draftmode "${file_path}"`;
        }
      }

      const result = await this.executeCommand(command);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              file_path,
              syntax_check: true,
              warnings: result.stdout || result.stderr,
              clean: result.success,
              command_used: command
            }, null, 2)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              file_path,
              syntax_check: true,
              error: error.message,
              clean: false
            }, null, 2)
          }
        ]
      };
    }
  }

  async handleGetLog(args) {
    const { log_path, file_path } = args;

    let logFile = log_path;
    
    // Auto-detect log file if not provided
    if (!logFile && file_path) {
      const baseName = path.basename(file_path, '.tex');
      const dir = path.dirname(file_path);
      logFile = path.join(dir, baseName + '.log');
      
      // Also check in build directory
      if (!fs.existsSync(logFile)) {
        logFile = path.join('build', baseName + '.log');
      }
    }

    if (!logFile || !fs.existsSync(logFile)) {
      throw new Error(`Log file not found: ${logFile}`);
    }

    try {
      const logAnalysis = this.parseLogFile(logFile);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              log_file: logFile,
              analysis: logAnalysis,
              summary: `Found ${logAnalysis.errors.length} errors, ${logAnalysis.warnings.length} warnings`
            }, null, 2)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              log_file: logFile,
              error: error.message
            }, null, 2)
          }
        ]
      };
    }
  }

  async handleCleanBuild(args) {
    const { target_dir = '.', aggressive = false } = args;

    const extensions = ['.aux', '.log', '.out', '.toc', '.lot', '.lof', '.fls', '.fdb_latexmk', '.synctex.gz', '.bbl', '.blg', '.idx', '.ind', '.ilg'];
    
    if (aggressive) {
      extensions.push('.pdf');
    }

    try {
      const cleanedFiles = [];
      
      for (const ext of extensions) {
        const pattern = path.join(target_dir, `*${ext}`);
        try {
          const command = `find "${target_dir}" -name "*${ext}" -type f`;
          const result = await this.executeCommand(command);
          
          if (result.success && result.stdout) {
            const files = result.stdout.trim().split('\n').filter(f => f);
            for (const file of files) {
              if (fs.existsSync(file)) {
                fs.unlinkSync(file);
                cleanedFiles.push(file);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to clean ${ext} files:`, error.message);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              target_directory: target_dir,
              cleaned_files: cleanedFiles,
              aggressive_clean: aggressive,
              summary: `Cleaned ${cleanedFiles.length} files`
            }, null, 2)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
              target_directory: target_dir
            }, null, 2)
          }
        ]
      };
    }
  }

  buildCompileCommand(engine, filePath, outputDir, verbose) {
    const baseCommand = [
      engine,
      '-interaction=nonstopmode',
      `-output-directory="${outputDir}"`,
      verbose ? '' : '-halt-on-error',
      `"${filePath}"`
    ].filter(Boolean).join(' ');

    return baseCommand;
  }

  executeCommand(command) {
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          code,
          stdout,
          stderr
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          code: -1,
          stdout,
          stderr: error.message
        });
      });
    });
  }

  parseLogFile(logPath) {
    try {
      const logContent = fs.readFileSync(logPath, 'utf8');
      const lines = logContent.split('\n');
      
      const errors = [];
      const warnings = [];
      const info = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Error patterns
        if (line.match(/^!/)) {
          errors.push({
            type: 'error',
            line_number: i + 1,
            message: line,
            context: lines.slice(Math.max(0, i - 1), i + 3).join('\n')
          });
        }
        
        // Warning patterns
        else if (line.match(/^(LaTeX Warning|Package .* Warning|Class .* Warning)/)) {
          warnings.push({
            type: 'warning',
            line_number: i + 1,
            message: line,
            context: lines.slice(Math.max(0, i - 1), i + 2).join('\n')
          });
        }
        
        // Info patterns
        else if (line.match(/^(Package:|Class:|Document Class:|LaTeX Font Info)/)) {
          info.push({
            type: 'info',
            line_number: i + 1,
            message: line
          });
        }
      }

      return {
        errors,
        warnings,
        info,
        total_lines: lines.length,
        has_errors: errors.length > 0,
        has_warnings: warnings.length > 0
      };

    } catch (error) {
      throw new Error(`Failed to parse log file: ${error.message}`);
    }
  }

  generateCompilationSummary(success, results, logAnalysis) {
    let summary = '';
    
    if (success) {
      summary = '✅ Compilation successful!';
      if (logAnalysis && logAnalysis.warnings.length > 0) {
        summary += ` (${logAnalysis.warnings.length} warnings)`;
      }
    } else {
      summary = '❌ Compilation failed.';
      if (logAnalysis) {
        if (logAnalysis.errors.length > 0) {
          summary += ` ${logAnalysis.errors.length} errors found.`;
        }
        if (logAnalysis.warnings.length > 0) {
          summary += ` ${logAnalysis.warnings.length} warnings found.`;
        }
      }
    }

    return summary;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('LaTeX Compile MCP server running on stdio');
  }
}

const server = new LaTeXCompileServer();
server.run().catch(console.error); 