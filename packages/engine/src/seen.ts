/**
 * How bright a flickering light looks. A light that flickers faster than an eye can follow looks steady, as bright
 * as its average light (the Talbot–Plateau law); one that flickers slower is seen to flicker.
 */

/**
 * The fastest flicker an eye can see in a bright light looked at straight on (the critical flicker fusion
 * frequency), Hz. Hecht and colleagues measured it rising with brightness, then levelling off at 50 to 60 Hz in the
 * centre of the eye; the top of that range is used, so Bench smooths away no flicker an eye could see. Reviewed in
 * Fernandez-Alonso et al., "Peripheral Flicker Fusion at High Luminance: Beyond the Ferry–Porter Law", Vision 7(1):26
 * (2023), and Chapiro et al., "Critical Flicker Frequency (CFF) at High Luminance Levels" (2023).
 */
export const FLICKER_FUSION_HZ = 60;

/**
 * A current as an eye would see the light it makes: averaged over the last 1/FLICKER_FUSION_HZ, then that average
 * averaged again over the same time. One average of that length cancels a flicker at exactly that rate (and its
 * multiples), but leaves a ripple from one that doesn't fit it a whole number of times; the second pass shrinks that
 * ripple to almost nothing, while a slower blink still swings all the way on and off.
 */
export class SeenAverage {
  private readonly raw: number[];
  private readonly once: number[];
  private rawSum: number;
  private onceSum: number;
  private at = 0;

  /** `ticks`: how many ticks make 1/FLICKER_FUSION_HZ. It starts as if `amps` had been flowing all along. */
  constructor(
    amps: number,
    private readonly ticks: number,
  ) {
    this.raw = new Array<number>(ticks).fill(amps);
    this.once = new Array<number>(ticks).fill(amps);
    this.rawSum = amps * ticks;
    this.onceSum = amps * ticks;
  }

  /** Adds the next tick's current. */
  add(amps: number): void {
    const i = this.at;
    this.rawSum += amps - (this.raw[i] ?? 0);
    this.raw[i] = amps;
    const average = this.rawSum / this.ticks;
    this.onceSum += average - (this.once[i] ?? 0);
    this.once[i] = average;
    this.at = (i + 1) % this.ticks;
    // Each time round, add the sums up afresh, so rounding can't build up over a long run.
    if (this.at === 0) {
      this.rawSum = this.raw.reduce((sum, a) => sum + a, 0);
      this.onceSum = this.once.reduce((sum, a) => sum + a, 0);
    }
  }

  /** The current as seen, A. */
  get amps(): number {
    return this.onceSum / this.ticks;
  }
}
