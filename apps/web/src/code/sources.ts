/**
 * Every part's code as text: Bench's default for each module (what the editor shows, and what "Edit source" starts
 * from), and the empty starting point for the parts you write in lessons.
 */
import type { ModuleId } from '@bench/engine';
import batteryText from '../../../../packages/engine/src/parts/battery.ts?raw';
import electrolyticText from '../../../../packages/engine/src/parts/electrolytic.ts?raw';
import esp32Text from '../../../../packages/engine/src/parts/esp32.ts?raw';
import resistorText from '../../../../packages/engine/src/parts/resistor.ts?raw';
import slideSwitchText from '../../../../packages/engine/src/parts/slide-switch.ts?raw';
import capacitorText from '../../../../packages/engine/src/models/capacitor/default.ts?raw';
import gpioText from '../../../../packages/engine/src/models/gpio/default.ts?raw';
import ledText from '../../../../packages/engine/src/models/led/default.ts?raw';
import potentiometerText from '../../../../packages/engine/src/models/potentiometer/default.ts?raw';
import switchText from '../../../../packages/engine/src/models/switch/default.ts?raw';
import transistorText from '../../../../packages/engine/src/models/transistor/default.ts?raw';
import ledStub from '../../../../packages/engine/src/lesson-1-light-an-led/led.ts?raw';
import switchStub from '../../../../packages/engine/src/lesson-2-switches/switch.ts?raw';
import potentiometerStub from '../../../../packages/engine/src/lesson-3-knob/potentiometer.ts?raw';
import capacitorStub from '../../../../packages/engine/src/lesson-4-capacitors/capacitor.ts?raw';
import transistorStub from '../../../../packages/engine/src/lesson-5-transistors/transistor.ts?raw';
import gpioStub from '../../../../packages/engine/src/lesson-6-microcontroller/gpio.ts?raw';
import programStub from '../../../../packages/engine/src/lesson-6-microcontroller/program.ts?raw';

/**
 * Bench's own code for each module, as it's written in the engine. Its imports are the engine's own paths; the loader
 * understands those too, so a copy runs anywhere unchanged.
 */
export const DEFAULT_SOURCES: Readonly<Record<ModuleId, string>> = {
  battery: batteryText,
  resistor: resistorText,
  led: ledText,
  switch: switchText,
  'slide-switch': slideSwitchText,
  potentiometer: potentiometerText,
  capacitor: capacitorText,
  electrolytic: electrolyticText,
  transistor: transistorText,
  gpio: gpioText,
  esp32: esp32Text,
};

/** Where each of Bench's defaults is written, in Bench's own code: change one there and it changes everywhere. */
export const DEFAULT_FILES: Readonly<Record<ModuleId, string>> = {
  battery: 'packages/engine/src/parts/battery.ts',
  resistor: 'packages/engine/src/parts/resistor.ts',
  led: 'packages/engine/src/models/led/default.ts',
  switch: 'packages/engine/src/models/switch/default.ts',
  'slide-switch': 'packages/engine/src/parts/slide-switch.ts',
  potentiometer: 'packages/engine/src/models/potentiometer/default.ts',
  capacitor: 'packages/engine/src/models/capacitor/default.ts',
  electrolytic: 'packages/engine/src/parts/electrolytic.ts',
  transistor: 'packages/engine/src/models/transistor/default.ts',
  gpio: 'packages/engine/src/models/gpio/default.ts',
  esp32: 'packages/engine/src/parts/esp32.ts',
};

/** The parts you write in lessons, and the lesson that introduces each. */
export const LESSON_MODULES = {
  led: 'light-an-led',
  switch: 'switches-and-buttons',
  potentiometer: 'a-knob',
  capacitor: 'capacitors',
  transistor: 'transistors',
  gpio: 'microcontroller',
} as const satisfies Partial<Record<ModuleId, string>>;

export type LessonModule = keyof typeof LESSON_MODULES;

export const isLessonModule = (id: ModuleId): id is LessonModule => id in LESSON_MODULES;

/** What you start each lesson's part from: its jobs, and nothing written. */
export const STUB_SOURCES: Readonly<Record<LessonModule, string>> = {
  led: ledStub,
  switch: switchStub,
  potentiometer: potentiometerStub,
  capacitor: capacitorStub,
  transistor: transistorStub,
  gpio: gpioStub,
};

/** What Lesson 6's ESP32 starts with. */
export const PROGRAM_STUB = programStub;

/** Where your lesson code for `id` is, in your home folder. */
export const lessonFile = (id: LessonModule) => `lessons/${id}.ts`;

/** Your Lesson 6 program, from before each chip had its own: what a chip runs until it has one. */
export const LESSON_PROGRAM_FILE = 'lessons/program.ts';
