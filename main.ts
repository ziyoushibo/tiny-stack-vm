// Tiny stack VM for make.fun tiny-stack-vm-01-run-20261122.
// Faithful port of the kit's reference VM (generator/subject/vm.mjs, ISA.md v1).
// Every trap, limit and wrapping rule is implemented in the order ISA.md states it.
// Run: MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STACK_MAX = 256;
const CALLS_MAX = 64;
const MEMORY_WORDS = 256;
const STEP_LIMIT = 1000000;
const OUTPUT_MAX = 65536;

// opcode: [immBytes, pops, pushes]
const OPS = new Map([
  [0x00, [0, 0, 0]], [0x01, [1, 0, 1]], [0x02, [4, 0, 1]],
  [0x03, [0, 1, 0]], [0x04, [0, 1, 2]], [0x05, [0, 2, 2]],
  [0x06, [0, 2, 3]], [0x07, [0, 3, 3]],
  [0x10, [0, 2, 1]], [0x11, [0, 2, 1]], [0x12, [0, 2, 1]],
  [0x13, [0, 2, 1]], [0x14, [0, 2, 1]], [0x15, [0, 2, 1]],
  [0x16, [0, 2, 1]], [0x17, [0, 1, 1]], [0x18, [0, 2, 1]],
  [0x19, [0, 2, 1]], [0x1a, [0, 2, 1]], [0x1b, [0, 1, 1]],
  [0x1c, [0, 2, 1]], [0x1d, [0, 2, 1]], [0x1e, [0, 2, 1]],
  [0x20, [0, 2, 1]], [0x21, [0, 2, 1]], [0x22, [0, 2, 1]],
  [0x30, [2, 0, 0]], [0x31, [2, 1, 0]], [0x32, [2, 1, 0]],
  [0x33, [2, 0, 0]], [0x34, [0, 0, 0]],
  [0x40, [0, 1, 1]], [0x41, [0, 2, 0]],
  [0x50, [0, 1, 0]], [0x51, [0, 1, 0]], [0x52, [0, 0, 1]],
  [0x53, [0, 1, 0]],
]);

function run(p, inp) {
  const n = p.length;
  const D = new Int32Array(STACK_MAX);
  let sp = 0;
  const C = new Int32Array(CALLS_MAX);
  let csp = 0;
  const M = new Int32Array(MEMORY_WORDS);
  const out = new Uint8Array(OUTPUT_MAX);
  let olen = 0;
  let inPos = 0;
  let pc = 0;
  let steps = 0;
  const enc = new TextEncoder();
  const done = (exit) => ({ out: out.slice(0, olen), code: exit });
  for (;;) {
    if (steps === STEP_LIMIT) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = OPS.get(p[pc]);
    if (op === undefined) return done(5);
    const imm = op[0], pops = op[1], pushes = op[2];
    if (pc + imm >= n) return done(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return done(2);
    if (sp - pops + pushes > STACK_MAX) return done(3);
    pc = next;
    const byte = p[next - 1 - imm] ?? p[pc - 1 - imm];
    // opcode byte is at the original pc; recover it from next-1-imm
    const opcode = p[next - 1 - imm];
    switch (opcode) {
      case 0x00: return done(0);
      case 0x01: D[sp++] = (p[next - 1] << 24) >> 24; break;
      case 0x02: D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1]; const a = D[sp - 2]; let r;
        if (opcode === 0x10) r = (a + b) | 0;
        else if (opcode === 0x11) r = (a - b) | 0;
        else if (opcode === 0x12) r = Math.imul(a, b);
        else if (opcode === 0x13) { if (b === 0) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (opcode === 0x14) { if (b === 0) return done(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (opcode === 0x15) { if (b === 0) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (opcode === 0x16) { if (b === 0) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (opcode === 0x18) r = a & b;
        else if (opcode === 0x19) r = a | b;
        else if (opcode === 0x1a) r = a ^ b;
        else if (opcode === 0x1c) r = a << (b & 31);
        else if (opcode === 0x1d) r = a >> (b & 31);
        else if (opcode === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (opcode === 0x20) r = a === b ? 1 : 0;
        else if (opcode === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (opcode !== 0x30) { const v = D[--sp]; take = opcode === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === CALLS_MAX) return done(7);
        C[csp++] = next; pc = p[next - 2] | (p[next - 1] << 8); break;
      case 0x34:
        if (csp === 0) return done(8);
        pc = C[--csp]; break;
      case 0x40: {
        const addr = D[sp - 1];
        if (addr < 0 || addr >= MEMORY_WORDS) return done(6);
        D[sp - 1] = M[addr]; break;
      }
      case 0x41: {
        const addr = D[sp - 1]; const v = D[sp - 2];
        if (addr < 0 || addr >= MEMORY_WORDS) return done(6);
        sp -= 2; M[addr] = v; break;
      }
      case 0x50: {
        const bytes = enc.encode(String(D[sp - 1]));
        if (olen + bytes.length > OUTPUT_MAX) return done(11);
        sp--; out.set(bytes, olen); olen += bytes.length; break;
      }
      case 0x51:
        if (olen + 1 > OUTPUT_MAX) return done(11);
        out[olen++] = D[--sp] & 255; break;
      case 0x52: D[sp++] = inPos < inp.length ? inp[inPos++] : -1; break;
      case 0x53: return done(D[--sp] & 255);
      default: return done(5);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), Uint8Array.from(r.out));
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
