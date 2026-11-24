/**
 * The program an ESP32 runs, as text, for the worker to load. For now every chip runs the one in the lesson's
 * program.ts; once boards are projects, each chip has its own.
 */
import type { ModuleSource } from '@bench/engine';
import programText from '../../../../packages/engine/src/lesson-6-microcontroller/program.ts?raw';

export const SHARED_PROGRAM: ModuleSource = { text: programText, file: 'program.ts' };
