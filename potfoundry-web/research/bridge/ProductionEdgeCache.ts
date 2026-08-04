/**
 * ProductionEdgeCache — Robust, zero-leak edge cache for research meshing.
 *
 * Design:
 *   - **Backward-shift linear probing deletion** (zero tombstones). Evicting a slot
 *     shifts subsequent entries backward to fill the gap, keeping all probe chains
 *     optimal. No tombstone accumulation, no O(N) lookup degradation.
 *   - **31-bit positive integer key clamping**. All keys are clamped to [0, 0x7FFFFFFC]
 *     to avoid collision with the UNUSED sentinel (0x7FFFFFFF). The two-value clamping
 *     window (TOMBSTONE and UNUSED) sacrifices 2 out of 2^31 keys — negligible.
 *   - **Flat typed array layout** with 50% load-factor capacity doubling.
 *   - **Deterministic hash**: Knuth multiplicative hash on the canonicalized (min, max)
 *     vertex pair, with full vertex-pair equality check to resolve collisions.
 *
 * Memory: 4 arrays of `capacity` elements each (2× Int32 for vertices, 1× Int32 for
 * keys, 1× Float32 for sags) = 16 bytes per slot. At 50% load factor, that's 32 bytes
 * per active edge.
 */

const UNUSED = 0x7FFFFFFF;     // Sentinel: slot is empty
const TOMBSTONE = 0x7FFFFFFE;  // Reserved: never used as a key (backward-shift means no tombstones)

export class ProductionEdgeCache {
  private capacity: number;
  private mask: number;
  private activeCount = 0;

  private keys: Int32Array;
  private minV: Int32Array;
  private maxV: Int32Array;
  private _sags: Float32Array;

  constructor(initialCapacity = 1 << 16) {
    // Ensure power of two
    let cap = 1;
    while (cap < initialCapacity) cap <<= 1;
    this.capacity = cap;
    this.mask = this.capacity - 1;
    this.keys = new Int32Array(this.capacity).fill(UNUSED);
    this.minV = new Int32Array(this.capacity);
    this.maxV = new Int32Array(this.capacity);
    this._sags = new Float32Array(this.capacity);
  }

  /**
   * Look up or allocate an edge slot for the pair (a, b).
   * The pair is canonicalized to (min, max) internally — order doesn't matter.
   * @returns The slot index. Use `getSag` / `setSag` to read/write the sag value.
   */
  lookup(a: number, b: number): number {
    // 50% Load factor cap → double table size and rehash
    if (this.activeCount * 2 > this.capacity) {
      this.rehash(this.capacity * 2);
    }

    const min = a < b ? a : b;
    const max = a < b ? b : a;
    const key = this.hashPair(min, max);

    let slot = key & this.mask;

    while (this.keys[slot] !== UNUSED) {
      if (this.keys[slot] === key && this.minV[slot] === min && this.maxV[slot] === max) {
        return slot; // Exact hit
      }
      slot = (slot + 1) & this.mask;
    }

    // Allocate slot
    this.keys[slot] = key;
    this.minV[slot] = min;
    this.maxV[slot] = max;
    this._sags[slot] = 0;
    this.activeCount++;
    return slot;
  }

  /**
   * Check whether edge (a, b) exists in the cache without allocating.
   * @returns The slot index, or -1 if not found.
   */
  find(a: number, b: number): number {
    const min = a < b ? a : b;
    const max = a < b ? b : a;
    const key = this.hashPair(min, max);

    let slot = key & this.mask;

    while (this.keys[slot] !== UNUSED) {
      if (this.keys[slot] === key && this.minV[slot] === min && this.maxV[slot] === max) {
        return slot;
      }
      slot = (slot + 1) & this.mask;
    }

    return -1;
  }

  /**
   * Backward-shift linear probing deletion.
   * Evicts the slot without leaving tombstones, keeping probe chains optimal.
   * No-op if the edge is not found.
   */
  evict(a: number, b: number): void {
    const min = a < b ? a : b;
    const max = a < b ? b : a;
    const key = this.hashPair(min, max);

    let i = key & this.mask;

    while (this.keys[i] !== UNUSED) {
      if (this.keys[i] === key && this.minV[i] === min && this.maxV[i] === max) {
        // Found target slot i. Perform backward shift deletion.
        this.keys[i] = UNUSED;
        this.activeCount--;

        let j = (i + 1) & this.mask;
        while (this.keys[j] !== UNUSED) {
          const homeSlot = this.keys[j] & this.mask;
          // Check if element at j was displaced past i (cyclic)
          const shouldShift = (i <= j)
            ? (homeSlot <= i || homeSlot > j)
            : (homeSlot <= i && homeSlot > j);

          if (shouldShift) {
            this.keys[i] = this.keys[j];
            this.minV[i] = this.minV[j];
            this.maxV[i] = this.maxV[j];
            this._sags[i] = this._sags[j];
            this.keys[j] = UNUSED;
            i = j;
          }
          j = (j + 1) & this.mask;
        }
        return;
      }
      i = (i + 1) & this.mask;
    }
  }

  /** Read the sag value at a slot returned by `lookup` or `find`. */
  getSag(slot: number): number {
    return this._sags[slot];
  }

  /** Write a sag value at a slot returned by `lookup`. */
  setSag(slot: number, value: number): void {
    this._sags[slot] = value;
  }

  /**
   * Direct access to the sag array. Exposed for hot-path code that needs to avoid
   * the function call overhead of getSag/setSag in tight inner loops (millions of
   * edge evaluations per refinement pass). Use with care — slot indices are only
   * valid between rehash operations.
   */
  get sags(): Float32Array {
    return this._sags;
  }

  /** Number of active edges in the cache. */
  get size(): number {
    return this.activeCount;
  }

  /** Load factor = activeCount / capacity. Rehash occurs when this exceeds 0.5. */
  get loadFactor(): number {
    return this.activeCount / this.capacity;
  }

  /**
   * Canonicalized hash for a vertex pair.
   * Knuth 32-bit multiplicative hash with 31-bit positive sign clamp.
   */
  private hashPair(min: number, max: number): number {
    let key = (Math.imul(min, 2654435761) ^ Math.imul(max, 2246822519)) & 0x7FFFFFFF;
    if (key >= TOMBSTONE) key = 0x7FFFFFFC;
    return key;
  }

  private rehash(newCapacity: number): void {
    const oldKeys = this.keys;
    const oldMinV = this.minV;
    const oldMaxV = this.maxV;
    const oldSags = this._sags;

    this.capacity = newCapacity;
    this.mask = newCapacity - 1;
    this.activeCount = 0;

    this.keys = new Int32Array(newCapacity).fill(UNUSED);
    this.minV = new Int32Array(newCapacity);
    this.maxV = new Int32Array(newCapacity);
    this._sags = new Float32Array(newCapacity);

    for (let i = 0; i < oldKeys.length; i++) {
      if (oldKeys[i] !== UNUSED) {
        const slot = this.lookup(oldMinV[i], oldMaxV[i]);
        this._sags[slot] = oldSags[i];
      }
    }
  }
}
