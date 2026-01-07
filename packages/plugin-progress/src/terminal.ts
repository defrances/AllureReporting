import { clearLine, clearScreenDown, cursorTo, moveCursor } from "node:readline";
import type { WriteStream } from "node:tty";

// Taken from https://github.com/npkgz/cli-progress
// low-level terminal interactions
export class Terminal {
  readonly #stream: WriteStream;
  #wrapLines: boolean;
  #dy: number;

  constructor(outputStream: WriteStream) {
    this.#stream = outputStream;

    // default: line wrapping enabled
    this.#wrapLines = true;

    // current, relative y position
    this.#dy = 0;
  }

  // save cursor position + settings
  cursorSave() {
    if (!this.#stream.isTTY) {
      return;
    }

    // save position
    this.#stream.write("\x1B7");
  }

  // restore last cursor position + settings
  cursorRestore() {
    if (!this.#stream.isTTY) {
      return;
    }

    // restore cursor
    this.#stream.write("\x1B8");
  }

  // show/hide cursor
  cursor(enabled: boolean) {
    if (!this.#stream.isTTY) {
      return;
    }

    if (enabled) {
      this.#stream.write("\x1B[?25h");
    } else {
      this.#stream.write("\x1B[?25l");
    }
  }

  // change cursor positionn
  cursorTo(x: number, y?: number) {
    if (!this.#stream.isTTY) {
      return;
    }

    // move cursor absolute
    cursorTo(this.#stream, x, y);
  }

  // change relative cursor position
  cursorRelative(dx: number, dy: number) {
    if (!this.#stream.isTTY) {
      return;
    }

    // store current position
    this.#dy = this.#dy + dy;

    // move cursor relative
    moveCursor(this.#stream, dx, dy);
  }

  // relative reset
  cursorRelativeReset() {
    if (!this.#stream.isTTY) {
      return;
    }

    // move cursor to initial line
    moveCursor(this.#stream, 0, -this.#dy);

    // first char
    cursorTo(this.#stream, 0);

    // reset counter
    this.#dy = 0;
  }

  // clear to the right from cursor
  clearRight() {
    if (!this.#stream.isTTY) {
      return;
    }

    clearLine(this.#stream, 1);
  }

  // clear the full line
  clearLine() {
    if (!this.#stream.isTTY) {
      return;
    }

    clearLine(this.#stream, 0);
  }

  // clear everyting beyond the current line
  clearBottom() {
    if (!this.#stream.isTTY) {
      return;
    }

    clearScreenDown(this.#stream);
  }

  // add new line; increment counter
  newline() {
    this.#stream.write("\n");
    this.#dy++;
  }

  // write content to output stream
  // @TODO use string-width to strip length
  write(s: string, rawWrite: boolean = false) {
    // line wrapping enabled ? trim output
    // this is just a fallback mechanism in case user enabled line-wrapping via options or set it to auto
    if (this.#wrapLines && !rawWrite) {
      this.#stream.write(s.slice(0, this.getWidth()));

      // standard behaviour with disabled linewrapping
    } else {
      this.#stream.write(s);
    }
  }

  // control line wrapping
  lineWrapping(enabled: boolean) {
    if (!this.isTTY()) {
      return;
    }

    // store state
    this.#wrapLines = enabled;
    if (enabled) {
      this.#stream.write("\x1B[?7h");
    } else {
      this.#stream.write("\x1B[?7l");
    }
  }

  // tty environment ?
  isTTY() {
    return this.#stream.isTTY;
  }

  // get terminal width
  getWidth() {
    // set max width to 80 in tty-mode and 200 in notty-mode
    return this.#stream.columns || (this.#stream.isTTY ? 80 : 200);
  }
}
