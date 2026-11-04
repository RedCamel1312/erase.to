export type TextMeasurement = { bytes: number; lines: number; pending: boolean };
const CHUNK_UNITS = 65536;
// Count without allocating an encoded copy of a potentially large draft. Long
// inputs yield between bounded chunks; replacing/clearing the draft cancels work.
export class TextMetrics {
  private text = '';
  private offset = 0;
  private bytes = 0;
  private lines = 1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private report: (measurement: TextMeasurement) => void) {}
  update(text: string): void {
    if (text === this.text && (this.offset || !text.length)) return;
    globalThis.clearTimeout(this.timer);
    this.timer = undefined;
    this.text = text;
    this.offset = 0;
    this.bytes = 0;
    this.lines = 1;
    if (text.length > CHUNK_UNITS) this.report({ bytes: 0, lines: 1, pending: true });
    this.step();
  }
  private step(): void {
    const end = Math.min(this.text.length, this.offset + CHUNK_UNITS);
    while (this.offset < end) {
      const code = this.text.charCodeAt(this.offset++);
      if (code === 10) this.lines++;
      if (code < 0x80) this.bytes++;
      else if (code < 0x800) this.bytes += 2;
      else if (
        code >= 0xd800 &&
        code <= 0xdbff &&
        this.offset < this.text.length &&
        this.text.charCodeAt(this.offset) >= 0xdc00 &&
        this.text.charCodeAt(this.offset) <= 0xdfff
      ) {
        this.bytes += 4;
        this.offset++;
      } else this.bytes += 3;
    }
    if (this.offset < this.text.length) this.timer = globalThis.setTimeout(() => this.step(), 0);
    else {
      this.timer = undefined;
      this.report({ bytes: this.bytes, lines: this.lines, pending: false });
    }
  }
  clear(): void {
    globalThis.clearTimeout(this.timer);
    this.timer = undefined;
    this.text = '';
    this.offset = 0;
    this.bytes = 0;
    this.lines = 1;
    this.report({ bytes: 0, lines: 1, pending: false });
  }
  destroy(): void {
    this.clear();
  }
}
